-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEEDS_CONFIRMATION', 'RESERVED', 'SENT', 'PREPARING', 'READY', 'PICKED_UP', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('VOICE', 'SCREEN');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('MOCK_DT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('AUTHORIZED', 'CAPTURED', 'VOIDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TelemetrySource" AS ENUM ('NAVI', 'FUSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "voice_order_enabled" BOOLEAN NOT NULL DEFAULT true,
    "voice_limit_per_order" INTEGER NOT NULL DEFAULT 20000,
    "voice_limit_daily" INTEGER NOT NULL DEFAULT 50000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel_type" "ChannelType" NOT NULL DEFAULT 'MOCK_DT',

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "lane_lat" DOUBLE PRECISION NOT NULL,
    "lane_lng" DOUBLE PRECISION NOT NULL,
    "lane_radius_m" INTEGER NOT NULL DEFAULT 40,
    "base_prep_sec" INTEGER NOT NULL DEFAULT 60,
    "service_sec_per_car" INTEGER NOT NULL DEFAULT 60,
    "margin_sec" INTEGER NOT NULL DEFAULT 30,
    "is_open" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_staff" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "login_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,

    CONSTRAINT "store_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "prep_sec" INTEGER NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "store_id" TEXT,
    "alias" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "source" "OrderSource" NOT NULL,
    "favorite_id" TEXT,
    "total_amount" INTEGER NOT NULL,
    "plate_number" TEXT NOT NULL,
    "external_order_id" TEXT,
    "est_prep_sec" INTEGER NOT NULL,
    "eta_at_send_sec" INTEGER,
    "idempotency_key" TEXT,
    "sent_at" TIMESTAMP(3),
    "lane_entered_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "picked_up_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "eta_sec" INTEGER,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speed_kmh" DOUBLE PRECISION NOT NULL,
    "gear" TEXT,
    "source" "TelemetrySource" NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "amount" INTEGER NOT NULL,
    "provider_ref" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dt_visits" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "lane_entered_at" TIMESTAMP(3) NOT NULL,
    "picked_up_at" TIMESTAMP(3),
    "wait_sec" INTEGER,

    CONSTRAINT "dt_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_device_id_key" ON "vehicles"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_staff_login_id_key" ON "store_staff"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_store_id_status_idx" ON "orders"("store_id", "status");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "telemetry_order_id_recorded_at_idx" ON "telemetry"("order_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "dt_visits_order_id_key" ON "dt_visits"("order_id");

-- CreateIndex
CREATE INDEX "dt_visits_store_id_picked_up_at_idx" ON "dt_visits"("store_id", "picked_up_at");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_staff" ADD CONSTRAINT "store_staff_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_visits" ADD CONSTRAINT "dt_visits_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dt_visits" ADD CONSTRAINT "dt_visits_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
