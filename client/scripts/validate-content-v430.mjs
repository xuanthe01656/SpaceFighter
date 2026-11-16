import {
  CONTENT_AUTHORING_FOUNDATION_V430,
  assertContentAuthoringFoundationV430,
  getContentAuthoringSummaryV430,
} from '../src/game/content/ContentAuthoringFoundationV430.js';
import { CONTENT_QA_MATRIX_V430 } from '../src/game/content/ContentQaMatrixV430.js';

const foundation = assertContentAuthoringFoundationV430();
const summary = getContentAuthoringSummaryV430();

console.log(JSON.stringify({
  ok: true,
  version: foundation.version,
  status: foundation.status,
  summary,
  qa: {
    campaignCases: CONTENT_QA_MATRIX_V430.campaign.length,
    dungeonCases: CONTENT_QA_MATRIX_V430.dungeons.length,
  },
}, null, 2));
