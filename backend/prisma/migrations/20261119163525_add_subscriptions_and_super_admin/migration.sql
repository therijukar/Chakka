-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('SUPER_ADMIN', 'OWNER', 'DRIVER') NOT NULL;

-- CreateTable
CREATE TABLE `subscription_plans` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `description` VARCHAR(255) NULL,
    `price_monthly_inr` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `price_yearly_inr` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `max_trucks` INTEGER NOT NULL DEFAULT 3,
    `max_drivers` INTEGER NOT NULL DEFAULT 5,
    `feature_ocr_vision` BOOLEAN NOT NULL DEFAULT false,
    `feature_fastag_auto_sync` BOOLEAN NOT NULL DEFAULT false,
    `feature_emi_tracker` BOOLEAN NOT NULL DEFAULT false,
    `feature_compliance_vault` BOOLEAN NOT NULL DEFAULT true,
    `feature_driver_permissions` BOOLEAN NOT NULL DEFAULT true,
    `feature_monthly_analytics` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscription_plans_name_key`(`name`),
    UNIQUE INDEX `subscription_plans_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `owner_subscriptions` (
    `id` CHAR(36) NOT NULL,
    `owner_id` CHAR(36) NOT NULL,
    `plan_id` CHAR(36) NOT NULL,
    `status` ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED') NOT NULL DEFAULT 'TRIAL',
    `starts_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `payment_note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `owner_subscriptions_owner_id_key`(`owner_id`),
    INDEX `owner_subscriptions_plan_id_idx`(`plan_id`),
    INDEX `owner_subscriptions_status_expires_at_idx`(`status`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `owner_subscriptions` ADD CONSTRAINT `owner_subscriptions_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `owner_subscriptions` ADD CONSTRAINT `owner_subscriptions_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
