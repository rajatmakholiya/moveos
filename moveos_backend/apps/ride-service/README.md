# ride-service — DORMANT (parked)

**Status: parked, not part of the production deployment.**

This service implements the on-demand single-ride lifecycle (`Ride` model:
REQUESTED → OFFERED → ACCEPTED → ARRIVED → STARTED → COMPLETED) — an
urban-ride-hail flow that is **not** the current product. Pahadi Rides runs on
the scheduled shared-seat model (`ScheduledTrip` + `SeatBooking`, served by
scheduling-service and booking-service).

Decision (2026-07-05): keep the code, do not extend it, do not deploy it.
The `Ride`, `RideEvent`, and ride-offer dispatch paths (Redis-atomic
accept/reject in dispatch-service) remain for a possible future on-demand
flow, but they are untested and excluded from `docker-compose.prod.yml`.

If you revive this flow, start by reading `ARCHITECTURE.md` §2.1 point 6
("Ride Model vs ScheduledTrip Model — Two Parallel Systems").
