-- Pins must sit inside Zamboanga City. Numbers mirror src/lib/city-bounds.ts; change both together.
alter table public.spots
  add constraint spots_within_zamboanga_city
  check (lat between 6.78 and 7.48 and lng between 121.75 and 122.58);
