/*
  Warnings:

  - A unique constraint covering the columns `[tokenId,accountId]` on the table `Holder` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Holder_tokenId_accountId_key" ON "Holder"("tokenId", "accountId");
