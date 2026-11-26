CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE IF NOT EXISTS identity.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,

    email VARCHAR(255) NOT NULL,
    phone_number VARCHAR(30),

    password_hash TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    deleted_at TIMESTAMPTZ,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT users_email_not_empty
        CHECK (length(trim(email)) > 0),

    CONSTRAINT users_first_name_not_empty
        CHECK (length(trim(first_name)) > 0),

    CONSTRAINT users_last_name_not_empty
        CHECK (length(trim(last_name)) > 0)
);

CREATE UNIQUE INDEX users_email_unique
    ON identity.users (lower(email));

CREATE UNIQUE INDEX users_phone_number_unique
    ON identity.users (phone_number)
    WHERE phone_number IS NOT NULL;
