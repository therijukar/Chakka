-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `role` ENUM('OWNER', 'DRIVER') NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `email` VARCHAR(180) NULL,
    `password_hash` VARCHAR(255) NULL,
    `pin_hash` VARCHAR(255) NULL,
    `language` ENUM('en', 'hi', 'bn', 'mr', 'ta') NOT NULL DEFAULT 'en',
    `owner_id` CHAR(36) NULL,
    `assigned_vehicle_id` CHAR(36) NULL,
    `inbound_toll_email` VARCHAR(180) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_phone_key`(`phone`),
    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_inbound_toll_email_key`(`inbound_toll_email`),
    INDEX `users_owner_id_idx`(`owner_id`),
    INDEX `users_assigned_vehicle_id_idx`(`assigned_vehicle_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `driver_permissions` (
    `id` CHAR(36) NOT NULL,
    `driver_id` CHAR(36) NOT NULL,
    `can_start_end_trip` BOOLEAN NOT NULL DEFAULT true,
    `can_add_fuel` BOOLEAN NOT NULL DEFAULT true,
    `can_add_other_expenses` BOOLEAN NOT NULL DEFAULT true,
    `can_view_own_bata_and_advance` BOOLEAN NOT NULL DEFAULT true,
    `can_view_toll_history` BOOLEAN NOT NULL DEFAULT false,
    `can_view_doc_vault` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `driver_permissions_driver_id_key`(`driver_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicles` (
    `id` CHAR(36) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `vehicle_number` VARCHAR(20) NOT NULL,
    `make_model` VARCHAR(120) NULL,
    `baseline_mileage_kmpl` DECIMAL(12, 2) NOT NULL DEFAULT 4.00,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `vehicles_vehicle_number_idx`(`vehicle_number`),
    UNIQUE INDEX `vehicles_owner_id_vehicle_number_key`(`owner_id`, `vehicle_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trips` (
    `id` CHAR(36) NOT NULL,
    `client_id` VARCHAR(64) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `vehicle_id` CHAR(36) NOT NULL,
    `driver_id` CHAR(36) NOT NULL,
    `origin` VARCHAR(180) NOT NULL,
    `destination` VARCHAR(180) NOT NULL,
    `party_name` VARCHAR(180) NULL,
    `agreed_freight` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `advance_received` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `balance_pending` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `driver_advance` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `driver_bata` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `start_odometer_km` DECIMAL(12, 2) NULL,
    `end_odometer_km` DECIMAL(12, 2) NULL,
    `start_odometer_photo_url` VARCHAR(512) NULL,
    `end_odometer_photo_url` VARCHAR(512) NULL,
    `start_lat` DECIMAL(10, 7) NULL,
    `start_lng` DECIMAL(10, 7) NULL,
    `end_lat` DECIMAL(10, 7) NULL,
    `end_lng` DECIMAL(10, 7) NULL,
    `started_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `status` ENUM('PLANNED', 'ACTIVE', 'COMPLETED', 'CLOSED') NOT NULL DEFAULT 'PLANNED',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `trips_client_id_key`(`client_id`),
    INDEX `trips_owner_id_status_idx`(`owner_id`, `status`),
    INDEX `trips_vehicle_id_status_idx`(`vehicle_id`, `status`),
    INDEX `trips_driver_id_status_idx`(`driver_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expense_categories` (
    `id` CHAR(36) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `icon` VARCHAR(60) NOT NULL DEFAULT 'receipt',
    `is_fuel` BOOLEAN NOT NULL DEFAULT false,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `expense_categories_owner_id_name_key`(`owner_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expenses` (
    `id` CHAR(36) NOT NULL,
    `client_id` VARCHAR(64) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `trip_id` CHAR(36) NULL,
    `vehicle_id` CHAR(36) NOT NULL,
    `driver_id` CHAR(36) NULL,
    `category_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `liters` DECIMAL(12, 2) NULL,
    `rate_per_liter` DECIMAL(12, 2) NULL,
    `pump_name` VARCHAR(180) NULL,
    `bill_date` DATETIME(3) NULL,
    `bill_photo_url` VARCHAR(512) NULL,
    `note` TEXT NULL,
    `ocr_confidence` DECIMAL(5, 2) NULL,
    `approval_status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `rejection_reason` VARCHAR(255) NULL,
    `approved_by_id` CHAR(36) NULL,
    `approved_at` DATETIME(3) NULL,
    `expense_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `expenses_client_id_key`(`client_id`),
    INDEX `expenses_owner_id_approval_status_idx`(`owner_id`, `approval_status`),
    INDEX `expenses_trip_id_idx`(`trip_id`),
    INDEX `expenses_vehicle_id_idx`(`vehicle_id`),
    INDEX `expenses_driver_id_idx`(`driver_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tolls` (
    `id` CHAR(36) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `vehicle_id` CHAR(36) NULL,
    `trip_id` CHAR(36) NULL,
    `vehicle_number_raw` VARCHAR(32) NOT NULL,
    `toll_plaza` VARCHAR(200) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `transaction_time` DATETIME(3) NOT NULL,
    `bank_source` VARCHAR(40) NULL,
    `raw_email_id` VARCHAR(180) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tolls_raw_email_id_key`(`raw_email_id`),
    INDEX `tolls_owner_id_transaction_time_idx`(`owner_id`, `transaction_time`),
    INDEX `tolls_vehicle_id_idx`(`vehicle_id`),
    INDEX `tolls_trip_id_idx`(`trip_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_logs` (
    `id` CHAR(36) NOT NULL,
    `client_id` VARCHAR(64) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `entity_type` ENUM('TRIP', 'EXPENSE', 'DOCUMENT') NOT NULL,
    `status` ENUM('PENDING', 'SYNCING', 'SYNCED', 'FAILED') NOT NULL,
    `error_message` TEXT NULL,
    `synced_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sync_logs_client_id_idx`(`client_id`),
    INDEX `sync_logs_user_id_synced_at_idx`(`user_id`, `synced_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_emis` (
    `id` CHAR(36) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `vehicle_id` CHAR(36) NOT NULL,
    `financer_name` VARCHAR(150) NOT NULL,
    `total_loan_amount` DECIMAL(12, 2) NOT NULL,
    `monthly_emi_amount` DECIMAL(12, 2) NOT NULL,
    `total_tenure_months` INTEGER NOT NULL,
    `emis_paid` INTEGER NOT NULL DEFAULT 0,
    `due_day_of_month` INTEGER NOT NULL,
    `remaining_principal` DECIMAL(12, 2) NOT NULL,
    `start_date` DATETIME(3) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `vehicle_emis_owner_id_is_active_idx`(`owner_id`, `is_active`),
    INDEX `vehicle_emis_vehicle_id_idx`(`vehicle_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `emi_payments` (
    `id` CHAR(36) NOT NULL,
    `emi_id` CHAR(36) NOT NULL,
    `amount_paid` DECIMAL(12, 2) NOT NULL,
    `payment_date` DATETIME(3) NOT NULL,
    `receipt_url` VARCHAR(512) NULL,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `emi_payments_emi_id_payment_date_idx`(`emi_id`, `payment_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_documents` (
    `id` CHAR(36) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `vehicle_id` CHAR(36) NULL,
    `driver_id` CHAR(36) NULL,
    `doc_type` ENUM('RC_BOOK', 'INSURANCE', 'ROAD_TAX', 'ALL_INDIA_PERMIT', 'STATE_PERMIT', 'FITNESS', 'PUC', 'DRIVING_LICENSE', 'AADHAAR', 'OTHER') NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `document_number` VARCHAR(80) NULL,
    `issue_date` DATETIME(3) NULL,
    `expiry_date` DATETIME(3) NULL,
    `file_url` VARCHAR(512) NOT NULL,
    `file_mime_type` VARCHAR(100) NOT NULL,
    `file_size_bytes` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `vehicle_documents_owner_id_expiry_date_idx`(`owner_id`, `expiry_date`),
    INDEX `vehicle_documents_vehicle_id_doc_type_idx`(`vehicle_id`, `doc_type`),
    INDEX `vehicle_documents_driver_id_doc_type_idx`(`driver_id`, `doc_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_assigned_vehicle_id_fkey` FOREIGN KEY (`assigned_vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `driver_permissions` ADD CONSTRAINT `driver_permissions_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trips` ADD CONSTRAINT `trips_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expense_categories` ADD CONSTRAINT `expense_categories_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tolls` ADD CONSTRAINT `tolls_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tolls` ADD CONSTRAINT `tolls_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tolls` ADD CONSTRAINT `tolls_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_logs` ADD CONSTRAINT `sync_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_emis` ADD CONSTRAINT `vehicle_emis_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_emis` ADD CONSTRAINT `vehicle_emis_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `emi_payments` ADD CONSTRAINT `emi_payments_emi_id_fkey` FOREIGN KEY (`emi_id`) REFERENCES `vehicle_emis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_documents` ADD CONSTRAINT `vehicle_documents_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_documents` ADD CONSTRAINT `vehicle_documents_vehicle_id_fkey` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_documents` ADD CONSTRAINT `vehicle_documents_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
