import cors from "cors";
import express, { type Request, type Response } from "express";
import { authContextMiddleware } from "./common/middlewares/authContext.js";
import { errorHandler } from "./common/middlewares/errorHandler.js";
import { buildCorsOptions } from "./config/corsOptions.js";
import { env } from "./config/env.js";
import { declarationRouter } from "./modules/declarations/declaration.routes.js";
import { gtipQueryRouter } from "./modules/gtip-query/gtipQuery.routes.js";
import { userRouter } from "./modules/users/user.routes.js";
import { materialRecordRouter } from "./modules/material-records/materialRecord.routes.js";
import { documentRuleRouter } from "./modules/document-rules/documentRule.routes.js";
import { mailTemplateRouter } from "./modules/mail-templates/mailTemplate.routes.js";
import { documentProcessRouter } from "./modules/document-processes/documentProcess.routes.js";
import { declarationApprovalRulesRouter } from "./modules/declaration-approval-rules/declarationApprovalRules.routes.js";
import { customerRouter } from "./modules/customers/customer.routes.js";

const app = express();

app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: env.jsonBodyLimit }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use("/api/declarations", authContextMiddleware, declarationRouter);
app.use("/api/gtip-query", authContextMiddleware, gtipQueryRouter);
app.use("/api/users", authContextMiddleware, userRouter);
app.use("/api/material-records", authContextMiddleware, materialRecordRouter);
app.use("/api/document-rules", authContextMiddleware, documentRuleRouter);
app.use("/api/mail-templates", authContextMiddleware, mailTemplateRouter);
app.use("/api/document-processes", authContextMiddleware, documentProcessRouter);
app.use("/api/declaration-approval-rules", authContextMiddleware, declarationApprovalRulesRouter);
app.use("/api/customers", authContextMiddleware, customerRouter);

app.use(errorHandler);

export default app;
