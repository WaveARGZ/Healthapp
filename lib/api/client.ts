import type { BodyMakeClient } from "@/lib/api/bodymake-client";
import { LocalBodyMakeClient } from "@/lib/storage/local-bodymake-client";
import { AwsBodyMakeClient } from "@/lib/api/aws-bodymake-client";
import { isCloudConfigured } from "@/lib/cloud/config";
import { FirebaseBodyMakeClient } from "@/lib/api/firebase-bodymake-client";
import { isFirebaseSelected } from "@/lib/firebase/config";

export const bodyMakeClient: BodyMakeClient = isFirebaseSelected
  ? new FirebaseBodyMakeClient()
  : isCloudConfigured ? new AwsBodyMakeClient() : new LocalBodyMakeClient();
