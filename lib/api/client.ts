import type { BodyMakeClient } from "@/lib/api/bodymake-client";
import { LocalBodyMakeClient } from "@/lib/storage/local-bodymake-client";
import { AwsBodyMakeClient } from "@/lib/api/aws-bodymake-client";
import { isCloudConfigured } from "@/lib/cloud/config";

export const bodyMakeClient: BodyMakeClient = isCloudConfigured ? new AwsBodyMakeClient() : new LocalBodyMakeClient();
