import assert from "node:assert/strict";
import {
  allowedOperationTypeKeys,
  defaultDeclarationListScope,
  isOperationTypeVisible,
  matchesMineScope,
  parseDeclarationListScope
} from "../../src/modules/declarations/declarationListScope.js";

assert.equal(defaultDeclarationListScope("MT"), "mine");
assert.equal(defaultDeclarationListScope("Operasyon"), "mine");
assert.equal(defaultDeclarationListScope("Saha"), "mine");
assert.equal(defaultDeclarationListScope("Admin"), "all");
assert.equal(defaultDeclarationListScope("Yönetici"), "all");
assert.equal(defaultDeclarationListScope("MT Yönetici"), "all");
assert.equal(defaultDeclarationListScope("Muhasebe"), "all");

assert.equal(parseDeclarationListScope(undefined), "all");
assert.equal(parseDeclarationListScope("mine"), "mine");
assert.equal(parseDeclarationListScope("all"), "all");
assert.equal(parseDeclarationListScope("weird"), "all");

const allowed = allowedOperationTypeKeys(["İhracat", "Transit"]);
assert.equal(isOperationTypeVisible("İthalat", allowed), false);
assert.equal(isOperationTypeVisible("İhracat", allowed), true);
assert.equal(isOperationTypeVisible("export", allowed), true);
assert.equal(isOperationTypeVisible("İthalat", allowedOperationTypeKeys([])), false);

const mine = new Set(["cust-1"]);
assert.equal(
  matchesMineScope({
    customerId: "cust-1",
    assigneeName: null,
    myCustomerIds: mine,
    userName: "Ali"
  }),
  true
);
assert.equal(
  matchesMineScope({
    customerId: "cust-2",
    assigneeName: "Ali Veli",
    myCustomerIds: mine,
    userName: "Ali Veli"
  }),
  true
);
assert.equal(
  matchesMineScope({
    customerId: "cust-2",
    assigneeName: "Başka",
    myCustomerIds: mine,
    userName: "Ali Veli"
  }),
  false
);

console.log("verifyDeclarationListScope: ok");
