-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING_ACCEPT', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'CANCEL_REQUESTED', 'REJECTED', 'CANCELLED');
-- 1차 상태 → 2차 상태. 매장에 공유되지 않았던 주문(확인 대기·예약)은 취소로, 전송된 주문은 매장 확인 중으로 옮긴다
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (
  CASE "status"::text
    WHEN 'NEEDS_CONFIRMATION' THEN 'CANCELLED'
    WHEN 'RESERVED' THEN 'CANCELLED'
    WHEN 'SENT' THEN 'PENDING_ACCEPT'
    ELSE "status"::text
  END
)::"OrderStatus_new";
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "eta_at_send_sec",
ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "cancel_note" TEXT,
ADD COLUMN     "cancel_request_note" TEXT,
ADD COLUMN     "cancel_requested_at" TIMESTAMP(3),
ADD COLUMN     "order_no" TEXT,
ADD COLUMN     "planned_pickup_at" TIMESTAMP(3),
ADD COLUMN     "preparing_at" TIMESTAMP(3),
ADD COLUMN     "reject_reason" TEXT,
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "status_before_cancel" "OrderStatus";

-- AlterTable
ALTER TABLE "stores" DROP COLUMN "base_prep_sec",
DROP COLUMN "margin_sec",
ADD COLUMN     "after_entry_sec" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "prep_sec" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "sold_out_menu_item_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "telemetry" ALTER COLUMN "lat" DROP NOT NULL,
ALTER COLUMN "lng" DROP NOT NULL,
ALTER COLUMN "speed_kmh" DROP NOT NULL;

-- CreateTable
CREATE TABLE "order_number_counters" (
    "store_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_number_counters_pkey" PRIMARY KEY ("store_id","day")
);

-- AddForeignKey
ALTER TABLE "order_number_counters" ADD CONSTRAINT "order_number_counters_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

