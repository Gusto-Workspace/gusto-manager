# Sauvegarde MongoDB vers Cloudinary

Le cron exporte les collections persistantes présentes dans la base de
`CONNECTION_STRING`, y compris les sept collections historiques lorsqu’elles
sont vides ou absentes. Il ignore les vues, les collections système et trois
collections de coordination recréées en cours d’exécution.

- `reservationdaylocks` et `takeawayslotlocks` contiennent des verrous temporaires.
- `timeclockwriteguards` contient les compteurs techniques de sérialisation des
  écritures de la Pointeuse.

Chaque archive `backup-full-*.tar.gz` contient un dossier horodaté avec un
tableau Extended JSON canonique par collection. Le fichier
`_backup/manifest.json` répertorie les fichiers, les nombres de documents, les
options des collections et leurs index. L’export utilise une lecture snapshot
MongoDB pour les documents. Les options et index sont lus séparément du snapshot.

## Restauration manuelle d’une archive

1. Télécharger le fichier depuis la console Cloudinary avec un compte autorisé,
   ou générer une URL temporaire signée avec le SDK Cloudinary. Pour
   `cloudinary.utils.private_download_url`, utiliser l’identifiant public complet
   de l’archive avec son extension, `undefined` pour le format et les options
   `resource_type: "raw"`, `type: "authenticated"` et `expires_at` (secondes Unix).
2. Extraire l’archive de confiance dans un répertoire protégé.
3. Depuis `server`, définir `GUSTO_RESTORE_MONGO_URI` pour la cible MongoDB
   isolée, puis lancer la commande avec le chemin du dossier horodaté et le nom
   explicite d’une base cible vide.

   ```sh
   node scripts/restore-mongo-backup.js /chemin/23-11-2026-12h00 gusto_restauration
   ```

4. Vérifier les volumes, les index et les références avant de connecter une
   application à la base restaurée.

Le script refuse une base déjà peuplée. Un échec peut laisser une restauration
partielle dans la base cible sans suppression automatique. Une nouvelle tentative
s’effectue sur une autre base vide après diagnostic. Les archives historiques
au format JSON simple nécessitent une conversion adaptée à leurs schémas.

Les références aux PDF, pièces RH et autres fichiers Cloudinary sont conservées
dans les documents MongoDB. Les binaires et les secrets de l’environnement
restent externes à l’archive. La durée de lecture dépend de la fenêtre de
snapshot MongoDB et l’envoi de la taille maximale acceptée par le compte Cloudinary.

## Accès et rétention

Cloudinary stocke les nouvelles archives `backup-full-*.tar.gz` dans
`Gusto_Workspace/backups` en `raw/authenticated`. Le cron vérifie que la
nouvelle archive est récente, la relit via une URL signée et compare son
empreinte SHA-256 à celle du fichier local.

Après cette vérification, la purge parcourt toutes les pages d’archives
historiques `raw/upload` et privées `raw/authenticated`. Seuls les identifiants
de sauvegarde attendus dans ce dossier et les dates Cloudinary `created_at`
de plus de sept jours sont retenus. Si la vérification échoue, le passage
conserve l’ensemble des archives existantes.
