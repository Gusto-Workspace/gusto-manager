#!/bin/bash

# Configuration MongoDB
MONGO_URI=$CONNECTION_STRING_TEST
BACKUP_DIR="/tmp/backups"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
COLLECTIONS=("admins" "menus" "owners" "restaurants") # Liste des collections à exporter

# Configuration Cloudinary
CLOUDINARY_CLOUD_NAME=$CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY=$CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET=$CLOUDINARY_API_SECRET
CLOUDINARY_FOLDER="Gusto_Workspace/backups"

# Créer un dossier temporaire pour la sauvegarde
EXPORT_DIR="$BACKUP_DIR/$DATE"
mkdir -p $EXPORT_DIR

# Exporter chaque collection en JSON
echo "Export des collections en cours..."
for collection in "${COLLECTIONS[@]}"
do
  echo "Export de la collection : $collection"
  ./tools/mongoexport --uri="$MONGO_URI" --collection=$collection --out="$EXPORT_DIR/$collection.json"
done

# Compresser le dossier contenant les exports
BACKUP_FILE="backup-$DATE.tar.gz"
echo "Compression des sauvegardes..."
tar -czf $BACKUP_DIR/$BACKUP_FILE -C $BACKUP_DIR $DATE

# Envoyer la sauvegarde sur Cloudinary
echo "Upload vers Cloudinary..."
UPLOAD_RESPONSE=$(curl -s -X POST \
  -F "file=@$BACKUP_DIR/$BACKUP_FILE" \
  -F "public_id=$CLOUDINARY_FOLDER/$BACKUP_FILE" \
  -F "resource_type=raw" \
  "https://api.cloudinary.com/v1_1/$CLOUDINARY_CLOUD_NAME/auto/upload" \
  -u "$CLOUDINARY_API_KEY:$CLOUDINARY_API_SECRET")

# Vérifier si l'upload a réussi
if echo "$UPLOAD_RESPONSE" | grep -q "\"url\""; then
  echo "Upload réussi, suppression des fichiers locaux..."
  rm -rf $EXPORT_DIR
  rm -f $BACKUP_DIR/$BACKUP_FILE
else
  echo "Échec de l'upload. Les fichiers locaux ne seront pas supprimés."
fi

# Suppression des fichiers de sauvegarde sur Cloudinary de plus de 14 jours
echo "Suppression des fichiers Cloudinary de plus de 14 jours..."
OLDER_THAN_DATE=$(date -d "-14 days" +%Y-%m-%dT%H:%M:%SZ)

# Récupérer tous les fichiers du dossier sur Cloudinary
FILE_LIST=$(curl -s -X GET \
  "https://api.cloudinary.com/v1_1/$CLOUDINARY_CLOUD_NAME/resources/raw/folder/$CLOUDINARY_FOLDER" \
  -u "$CLOUDINARY_API_KEY:$CLOUDINARY_API_SECRET")

# Filtrer et supprimer les fichiers plus vieux que 14 jours
echo "$FILE_LIST" | grep -o '"public_id":"[^"]*"' | sed 's/"public_id":"//' | sed 's/"//' | while read -r file
do
  # Récupérer la date de création du fichier
  CREATED_AT=$(echo "$FILE_LIST" | grep -o "\"created_at\":\"[^\"]*\",\"public_id\":\"$file\"" | grep -o '"created_at":"[^"]*"' | sed 's/"created_at":"//' | sed 's/"//')

  # Comparer avec la date limite
  if [[ "$CREATED_AT" < "$OLDER_THAN_DATE" ]]; then
    echo "Suppression du fichier sur Cloudinary : $file"
    curl -s -X DELETE \
      "https://api.cloudinary.com/v1_1/$CLOUDINARY_CLOUD_NAME/resources/raw/$file" \
      -u "$CLOUDINARY_API_KEY:$CLOUDINARY_API_SECRET"
  fi
done

echo "Nettoyage terminé."
echo "Sauvegarde terminée : $BACKUP_FILE dans $CLOUDINARY_FOLDER"
