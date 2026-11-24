export type FunnelEvent =
  | "signup_started"
  | "signup_completed"
  | "workspace_created"
  | "setup_step_completed"
  | "first_lead_captured"
  | "first_appointment_booked"
  | "subscription_activated"
  | "subscription_cancelled";
export type FunnelProperties = Record<string, string | number | boolean>;
