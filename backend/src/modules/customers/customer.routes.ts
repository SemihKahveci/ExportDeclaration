import { Router } from "express";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import * as ctrl from "./customer.controller.js";

export const customerRouter = Router();

customerRouter.get("/", asyncHandler(ctrl.getCustomers));
customerRouter.post("/", asyncHandler(ctrl.postCustomer));
customerRouter.patch("/:id", asyncHandler(ctrl.patchCustomer));
customerRouter.delete("/:id", asyncHandler(ctrl.deleteCustomer));

customerRouter.get("/:customerId/addresses", asyncHandler(ctrl.getAddresses));
customerRouter.post("/:customerId/addresses", asyncHandler(ctrl.postAddress));
customerRouter.patch("/addresses/:id", asyncHandler(ctrl.patchAddress));
customerRouter.delete("/addresses/:id", asyncHandler(ctrl.deleteAddress));

customerRouter.get("/:customerId/domains", asyncHandler(ctrl.getDomains));
customerRouter.post("/:customerId/domains", asyncHandler(ctrl.postDomain));
customerRouter.patch("/domains/:id", asyncHandler(ctrl.patchDomain));
customerRouter.delete("/domains/:id", asyncHandler(ctrl.deleteDomain));

customerRouter.get("/:customerId/mails", asyncHandler(ctrl.getMails));
customerRouter.post("/:customerId/mails", asyncHandler(ctrl.postMail));
customerRouter.patch("/mails/:id", asyncHandler(ctrl.patchMail));
customerRouter.delete("/mails/:id", asyncHandler(ctrl.deleteMail));

customerRouter.get("/:customerId/document-rules", asyncHandler(ctrl.getDocRules));
customerRouter.post("/:customerId/document-rules", asyncHandler(ctrl.postDocRule));
customerRouter.patch("/document-rules/:id", asyncHandler(ctrl.patchDocRule));
customerRouter.delete("/document-rules/:id", asyncHandler(ctrl.deleteDocRule));

customerRouter.get("/:customerId/notification-rules", asyncHandler(ctrl.getNotifyRules));
customerRouter.post("/:customerId/notification-rules", asyncHandler(ctrl.postNotifyRule));
customerRouter.patch("/notification-rules/:id", asyncHandler(ctrl.patchNotifyRule));
customerRouter.delete("/notification-rules/:id", asyncHandler(ctrl.deleteNotifyRule));

customerRouter.get("/:customerId/declaration-field-rules", asyncHandler(ctrl.getDeclFieldRules));
customerRouter.post("/:customerId/declaration-field-rules", asyncHandler(ctrl.postDeclFieldRule));
customerRouter.patch("/declaration-field-rules/:id", asyncHandler(ctrl.patchDeclFieldRule));
customerRouter.delete("/declaration-field-rules/:id", asyncHandler(ctrl.deleteDeclFieldRule));
