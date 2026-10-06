const ROOT = "Gusto_Workspace/design-lab";

module.exports = {
  ROOT,
  REFERENCES: `${ROOT}/references`,
  GENERATIONS: `${ROOT}/generations`,
  projectAssets: (projectId) => `${ROOT}/projects/${projectId}/assets`,
  portfolio: (siteId) => `${ROOT}/portfolio/${siteId}`,
  structural: (referenceId) => `${ROOT}/structural-references/${referenceId}`,
};
