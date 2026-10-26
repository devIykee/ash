import agentApi from "../../docs/AGENT_API.md";
import architecture from "../../docs/ARCHITECTURE.md";
import contributing from "../../docs/CONTRIBUTING.md";
import cryptography from "../../docs/CRYPTOGRAPHY.md";
import demo from "../../docs/DEMO.md";
import deployment from "../../docs/DEPLOYMENT.md";
import modules from "../../docs/MODULES.md";
import operations from "../../docs/OPERATIONS.md";
import privacy from "../../docs/PRIVACY.md";
import threatModel from "../../docs/THREAT_MODEL.md";
import zcash from "../../docs/ZCASH_INTEGRATION.md";
import readme from "../../README.md";
import submission from "../../SUBMISSION.md";

export const manuals: Record<string, string> = {
  README: readme,
  ARCHITECTURE: architecture,
  THREAT_MODEL: threatModel,
  PRIVACY: privacy,
  CRYPTOGRAPHY: cryptography,
  ZCASH_INTEGRATION: zcash,
  OPERATIONS: operations,
  AGENT_API: agentApi,
  MODULES: modules,
  DEPLOYMENT: deployment,
  DEMO: demo,
  CONTRIBUTING: contributing,
  SUBMISSION: submission,
};
