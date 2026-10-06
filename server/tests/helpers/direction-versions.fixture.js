// Test-only metadata: one existing fixture direction plus two inert principal
// slots. No API, persistence or production migration is involved.
function seedVersionedFixture(project, direction = project.directions[0]) {
  Object.assign(direction, { slot: "A", version: 1, status: "active", generationId: "fixture-initial-abc", replacesDirectionId: null });
  for (const slot of ["B", "C"]) if (!project.directions.some((item) => item.slot === slot && item.status === "active")) {
    const data = direction.toObject();
    delete data._id; delete data.createdAt; delete data.updatedAt;
    project.directions.push({ ...data, name: `Fixture ${slot}`, slot, styleFrames: [], approvedStyleFrameId: null });
  }
}
module.exports = { seedVersionedFixture };
