const path = require("path");
const { DOMParser } = require("@xmldom/xmldom");
const { strFromU8, unzipSync } = require("fflate");

const SPREADSHEET_NS =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const OFFICE_RELATIONSHIP_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIP_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const MAX_UNCOMPRESSED_XLSX_SIZE = 25 * 1024 * 1024;
const MAX_DISH_IMPORT_ROWS = 5000;

const DISH_IMPORT_COLUMNS = [
  "category",
  "categoryDescription",
  "subCategory",
  "name",
  "description",
  "price",
  "showOnWebsite",
  "vegan",
  "vegetarian",
  "bio",
  "glutenFree",
];

class DishCardImportError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "DishCardImportError";
    this.statusCode = 400;
    this.details = details;
  }
}

function parseXml(archive, archivePath) {
  const content = archive[archivePath];
  if (!content)
    throw new Error(`Fichier XLSX interne manquant : ${archivePath}`);

  const parserErrors = [];
  const document = new DOMParser({
    errorHandler: (level, message) => {
      if (level === "error" || level === "fatalError")
        parserErrors.push(message);
    },
  }).parseFromString(strFromU8(content), "application/xml");

  if (parserErrors.length > 0) {
    throw new Error(`XML XLSX invalide : ${archivePath}`);
  }
  return document;
}

function getElements(parent, namespace, localName) {
  return Array.from(parent.getElementsByTagNameNS(namespace, localName));
}

function getText(parent, namespace, localName) {
  return getElements(parent, namespace, localName)
    .map((element) => element.textContent || "")
    .join("");
}

function columnReferenceToIndex(reference) {
  const match = /^([A-Z]+)/i.exec(reference || "");
  if (!match) return 0;

  return (
    [...match[1].toUpperCase()].reduce(
      (index, character) => index * 26 + character.charCodeAt(0) - 64,
      0,
    ) - 1
  );
}

function resolveWorkbookTarget(target) {
  if (!target) return "";
  if (target.startsWith("/")) return target.slice(1);
  return path.posix.normalize(path.posix.join("xl", target));
}

function parseWorksheetRows(archive, worksheetPath, sharedStrings) {
  const worksheetDocument = parseXml(archive, worksheetPath);

  return getElements(worksheetDocument, SPREADSHEET_NS, "row").map((row) => {
    const values = [];

    for (const cell of getElements(row, SPREADSHEET_NS, "c")) {
      const columnIndex = columnReferenceToIndex(cell.getAttribute("r"));
      const type = cell.getAttribute("t");
      const rawValue = getText(cell, SPREADSHEET_NS, "v");
      let value = rawValue;

      if (type === "inlineStr") {
        value = getText(cell, SPREADSHEET_NS, "t");
      } else if (type === "s") {
        value = sharedStrings[Number(rawValue)] ?? "";
      } else if (type === "b") {
        value = rawValue === "1";
      } else if (type === "n" || (!type && rawValue !== "")) {
        const numericValue = Number(rawValue);
        value = Number.isFinite(numericValue) ? numericValue : rawValue;
      }

      values[columnIndex] = value;
    }

    return values;
  });
}

function parseXlsxSheets(buffer) {
  let uncompressedSize = 0;
  const archive = unzipSync(buffer, {
    filter: (file) => {
      const isWorkbookRelationship = file.name === "xl/_rels/workbook.xml.rels";
      if (
        !isWorkbookRelationship &&
        (!file.name.startsWith("xl/") || !file.name.endsWith(".xml"))
      ) {
        return false;
      }
      uncompressedSize += file.originalSize;
      if (uncompressedSize > MAX_UNCOMPRESSED_XLSX_SIZE) {
        throw new Error(
          "Le contenu décompressé du fichier XLSX est trop volumineux.",
        );
      }
      return true;
    },
  });

  const workbookDocument = parseXml(archive, "xl/workbook.xml");
  const relationshipsDocument = parseXml(archive, "xl/_rels/workbook.xml.rels");
  const relationships = new Map(
    getElements(
      relationshipsDocument,
      PACKAGE_RELATIONSHIP_NS,
      "Relationship",
    ).map((relationship) => [
      relationship.getAttribute("Id"),
      resolveWorkbookTarget(relationship.getAttribute("Target")),
    ]),
  );
  const sharedStrings = archive["xl/sharedStrings.xml"]
    ? getElements(
        parseXml(archive, "xl/sharedStrings.xml"),
        SPREADSHEET_NS,
        "si",
      ).map((item) => getText(item, SPREADSHEET_NS, "t"))
    : [];

  return getElements(workbookDocument, SPREADSHEET_NS, "sheet").map((sheet) => {
    const relationshipId = sheet.getAttributeNS(OFFICE_RELATIONSHIP_NS, "id");
    const worksheetPath = relationships.get(relationshipId);
    if (!worksheetPath) {
      throw new Error("Relation de feuille XLSX introuvable.");
    }

    return {
      name: sheet.getAttribute("name") || "",
      rows: parseWorksheetRows(archive, worksheetPath, sharedStrings),
    };
  });
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return normalizeText(value).toLocaleLowerCase("fr-FR");
}

function getCellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return value;
  return String(value);
}

function parsePrice(value, rowNumber, errors) {
  if (value === "" || value === null || value === undefined) return undefined;

  const normalized = String(value)
    .trim()
    .replace(/[\s\u00a0€]/g, "")
    .replace(",", ".");
  const price = Number(normalized);

  if (!normalized || !Number.isFinite(price) || price < 0) {
    errors.push({
      row: rowNumber,
      column: "price",
      message: "Le prix doit être un nombre positif ou nul.",
    });
    return undefined;
  }

  return price;
}

function parseBoolean(value, column, rowNumber, defaultValue, errors) {
  if (value === "" || value === null || value === undefined) {
    return defaultValue;
  }
  if (typeof value === "boolean") return value;
  if (value === 1 || value === 0) return value === 1;

  const normalized = normalizeKey(value);
  if (["true", "1", "yes", "oui", "vrai"].includes(normalized)) return true;
  if (["false", "0", "no", "non", "faux"].includes(normalized)) return false;

  errors.push({
    row: rowNumber,
    column,
    message: "La valeur doit être true/false, oui/non ou 1/0.",
  });
  return defaultValue;
}

function buildHeaderMap(headerRow = []) {
  const headerMap = new Map();
  headerRow.forEach((value, columnIndex) => {
    const header = normalizeText(getCellValue(value));
    if (header) headerMap.set(header.toLocaleLowerCase("fr-FR"), columnIndex);
  });
  return headerMap;
}

function preserveExistingIds(categories, existingCategories = []) {
  const existingCategoryMap = new Map(
    existingCategories.map((category) => [
      normalizeKey(category.name),
      category,
    ]),
  );

  return categories.map((category) => {
    const existingCategory = existingCategoryMap.get(
      normalizeKey(category.name),
    );
    if (existingCategory?._id) category._id = existingCategory._id;

    const existingDishMap = new Map(
      (existingCategory?.dishes || []).map((dish) => [
        normalizeKey(dish.name),
        dish,
      ]),
    );
    category.dishes.forEach((dish) => {
      const existingDish = existingDishMap.get(normalizeKey(dish.name));
      if (existingDish?._id) dish._id = existingDish._id;
    });

    const existingSubCategoryMap = new Map(
      (existingCategory?.subCategories || []).map((subCategory) => [
        normalizeKey(subCategory.name),
        subCategory,
      ]),
    );
    category.subCategories.forEach((subCategory) => {
      const existingSubCategory = existingSubCategoryMap.get(
        normalizeKey(subCategory.name),
      );
      if (existingSubCategory?._id) subCategory._id = existingSubCategory._id;

      const existingSubDishMap = new Map(
        (existingSubCategory?.dishes || []).map((dish) => [
          normalizeKey(dish.name),
          dish,
        ]),
      );
      subCategory.dishes.forEach((dish) => {
        const existingDish = existingSubDishMap.get(normalizeKey(dish.name));
        if (existingDish?._id) dish._id = existingDish._id;
      });
    });

    return category;
  });
}

async function parseDishCardWorkbook(buffer, existingCategories = []) {
  let sheets;
  let rows;

  try {
    sheets = parseXlsxSheets(buffer);
  } catch (_error) {
    throw new DishCardImportError(
      "Le fichier XLSX est illisible ou ne contient aucune feuille exploitable.",
    );
  }

  const selectedSheet = sheets.find((sheet) => {
    const headerMap = buildHeaderMap(sheet.rows[0]);
    return DISH_IMPORT_COLUMNS.every((column) =>
      headerMap.has(column.toLocaleLowerCase("fr-FR")),
    );
  });
  rows = selectedSheet?.rows || sheets[0]?.rows || [];

  const headerMap = buildHeaderMap(rows[0]);
  const missingColumns = DISH_IMPORT_COLUMNS.filter(
    (column) => !headerMap.has(column.toLocaleLowerCase("fr-FR")),
  );
  if (missingColumns.length > 0) {
    throw new DishCardImportError(
      "Le fichier ne respecte pas le modèle d’import de la carte.",
      missingColumns.map((column) => ({
        row: 1,
        column,
        message: `Colonne obligatoire manquante : ${column}.`,
      })),
    );
  }
  if (rows.length - 1 > MAX_DISH_IMPORT_ROWS) {
    throw new DishCardImportError(
      `Le fichier ne doit pas contenir plus de ${MAX_DISH_IMPORT_ROWS} lignes de plats.`,
    );
  }

  const errors = [];
  const categories = [];
  const categoryMap = new Map();
  let dishCount = 0;
  let subCategoryCount = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const rowNumber = rowIndex + 1;
    const row = rows[rowIndex] || [];
    const values = Object.fromEntries(
      DISH_IMPORT_COLUMNS.map((column) => [
        column,
        getCellValue(row[headerMap.get(column.toLocaleLowerCase("fr-FR"))]),
      ]),
    );
    const isEmpty = DISH_IMPORT_COLUMNS.every(
      (column) => normalizeText(values[column]) === "",
    );
    if (isEmpty) continue;

    const categoryName = normalizeText(values.category);
    const categoryDescription = normalizeText(values.categoryDescription);
    const subCategoryName = normalizeText(values.subCategory);
    const dishName = normalizeText(values.name);

    if (!categoryName) {
      errors.push({
        row: rowNumber,
        column: "category",
        message: "La catégorie est obligatoire.",
      });
    }
    if (!dishName) {
      errors.push({
        row: rowNumber,
        column: "name",
        message: "Le nom du plat est obligatoire.",
      });
    }
    if (!categoryName || !dishName) continue;

    const categoryKey = normalizeKey(categoryName);
    let category = categoryMap.get(categoryKey);
    if (!category) {
      category = {
        name: categoryName,
        description: categoryDescription,
        visible: true,
        subCategories: [],
        dishes: [],
        __subCategoryMap: new Map(),
        __dishKeys: new Set(),
      };
      categoryMap.set(categoryKey, category);
      categories.push(category);
    } else if (
      categoryDescription &&
      category.description &&
      normalizeKey(category.description) !== normalizeKey(categoryDescription)
    ) {
      errors.push({
        row: rowNumber,
        column: "categoryDescription",
        message: `La description de la catégorie « ${category.name} » n’est pas identique sur toutes les lignes.`,
      });
    } else if (!category.description && categoryDescription) {
      category.description = categoryDescription;
    }

    let destination = category;
    if (subCategoryName) {
      const subCategoryKey = normalizeKey(subCategoryName);
      let subCategory = category.__subCategoryMap.get(subCategoryKey);
      if (!subCategory) {
        subCategory = {
          name: subCategoryName,
          visible: true,
          dishes: [],
          __dishKeys: new Set(),
        };
        category.__subCategoryMap.set(subCategoryKey, subCategory);
        category.subCategories.push(subCategory);
        subCategoryCount += 1;
      }
      destination = subCategory;
    }

    const dishKey = normalizeKey(dishName);
    if (destination.__dishKeys.has(dishKey)) {
      errors.push({
        row: rowNumber,
        column: "name",
        message: `Le plat « ${dishName} » est présent plusieurs fois dans la même catégorie.`,
      });
      continue;
    }
    destination.__dishKeys.add(dishKey);

    destination.dishes.push({
      name: dishName,
      description: normalizeText(values.description),
      price: parsePrice(values.price, rowNumber, errors),
      showOnWebsite: parseBoolean(
        values.showOnWebsite,
        "showOnWebsite",
        rowNumber,
        true,
        errors,
      ),
      vegan: parseBoolean(values.vegan, "vegan", rowNumber, false, errors),
      vegetarian: parseBoolean(
        values.vegetarian,
        "vegetarian",
        rowNumber,
        false,
        errors,
      ),
      bio: parseBoolean(values.bio, "bio", rowNumber, false, errors),
      glutenFree: parseBoolean(
        values.glutenFree,
        "glutenFree",
        rowNumber,
        false,
        errors,
      ),
    });
    dishCount += 1;
  }

  if (dishCount === 0 && errors.length === 0) {
    errors.push({
      row: 2,
      column: "name",
      message: "Le fichier ne contient aucun plat à importer.",
    });
  }

  if (errors.length > 0) {
    throw new DishCardImportError(
      `Import impossible : ${errors.length} erreur(s) détectée(s).`,
      errors.slice(0, 100),
    );
  }

  categories.forEach((category) => {
    delete category.__subCategoryMap;
    delete category.__dishKeys;
    category.subCategories.forEach((subCategory) => {
      delete subCategory.__dishKeys;
    });
  });

  return {
    categories: preserveExistingIds(categories, existingCategories),
    summary: {
      categoryCount: categories.length,
      subCategoryCount,
      dishCount,
    },
  };
}

module.exports = {
  DISH_IMPORT_COLUMNS,
  DishCardImportError,
  parseDishCardWorkbook,
};
