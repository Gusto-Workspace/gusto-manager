export function isCallSenseAvailableForRestaurant(state, restaurantId) {
  return Boolean(restaurantId && state?.available && String(state.availabilityRestaurantId) === String(restaurantId));
}
