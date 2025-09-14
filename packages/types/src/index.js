"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobCreateInputSchema = void 0;
const zod_1 = require("zod");
exports.JobCreateInputSchema = zod_1.z.object({
    source_url: zod_1.z.string().url(),
    preset_id: zod_1.z.string().optional(),
});
//# sourceMappingURL=index.js.map