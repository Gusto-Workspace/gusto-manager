export const FINANCIAL_MODULE_LABELS = {
  gift_card: "Cartes cadeaux",
  take_away: "Vente à emporter",
};

export function activeFinancialModules(options = {}) {
  return Object.keys(FINANCIAL_MODULE_LABELS).filter(
    (module) => options[module] === true,
  );
}

export function selectedFinancialSeries(
  seriesByModule,
  activeModules,
  selectedModule,
  selectedCurrency,
) {
  const moduleKey = activeModules.includes(selectedModule)
    ? selectedModule
    : activeModules[0];
  const series = seriesByModule?.[moduleKey] || [];
  const selected =
    series.find((item) => item.currency === selectedCurrency) || series[0];
  return {
    module: moduleKey,
    currency: selected?.currency || "eur",
    data: selected?.monthlySales || [],
    currencies: series.map((item) => item.currency),
  };
}

export function validExportSelection(from, to, selected, available) {
  const validDate = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  return (
    validDate(from) &&
    validDate(to) &&
    from <= to &&
    selected.length > 0 &&
    selected.every((module) => available.includes(module))
  );
}
