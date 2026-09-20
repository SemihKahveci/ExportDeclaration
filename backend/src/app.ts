import cors from "cors";
import express, { type Request, type Response } from "express";
import { authContextMiddleware } from "./common/middlewares/authContext.js";
import { errorHandler } from "./common/middlewares/errorHandler.js";
import { buildCorsOptions } from "./config/corsOptions.js";
import { env } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { declarationRouter } from "./modules/declarations/declaration.routes.js";
import { gtipQueryRouter } from "./modules/gtip-query/gtipQuery.routes.js";
import { userRouter } from "./modules/users/user.routes.js";
import { materialRecordRouter } from "./modules/material-records/materialRecord.routes.js";
import { documentRuleRouter } from "./modules/document-rules/documentRule.routes.js";
import { mailTemplateRouter } from "./modules/mail-templates/mailTemplate.routes.js";
import { documentProcessRouter } from "./modules/document-processes/documentProcess.routes.js";
import { declarationApprovalRulesRouter } from "./modules/declaration-approval-rules/declarationApprovalRules.routes.js";
import { customerRouter } from "./modules/customers/customer.routes.js";
import { licenseMiddleware } from "./common/middlewares/licenseMiddleware.js";
import { licenseRouter } from "./modules/license/license.routes.js";
import { mailRouter } from "./modules/mail/mail.routes.js";
import { customsMasterDataRouter } from "./modules/customs-master-data/customsMasterData.routes.js";

const app = express();

app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: env.jsonBodyLimit }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use("/api/license", licenseRouter);
// Bu satırdan sonraki bütün API endpointleri geçerli lisans ister.
app.use("/api", licenseMiddleware);

// Login public; /me kendi içinde oturum doğrular.
app.use("/api/auth", authRouter);

// Buradan sonraki iş API'leri giriş ister.
app.use("/api", authContextMiddleware);

app.use("/api/declarations", declarationRouter);
app.use("/api/gtip-query", gtipQueryRouter);
app.use("/api/users", userRouter);
app.use("/api/material-records", materialRecordRouter);
app.use("/api/document-rules", documentRuleRouter);
app.use("/api/mail-templates", mailTemplateRouter);
app.use("/api/mail", mailRouter);
app.use("/api/document-processes", documentProcessRouter);
app.use("/api/declaration-approval-rules", declarationApprovalRulesRouter);
app.use("/api/customers", customerRouter);
app.use("/api/customs-master-data", customsMasterDataRouter);

app.use(errorHandler);

export default app;
