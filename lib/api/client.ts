import type { BodyMakeClient } from "@/lib/api/bodymake-client";
import { LocalBodyMakeClient } from "@/lib/storage/local-bodymake-client";

// Replace this composition root with an API Gateway client when AWS is added.
export const bodyMakeClient: BodyMakeClient = new LocalBodyMakeClient();
