CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id),
    department VARCHAR(100),
    employee_code VARCHAR(50) UNIQUE,
    date_of_birth DATE,
    address VARCHAR(255),
    citizen_id VARCHAR(20) UNIQUE,
    phone VARCHAR(20),
    avatar_url VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(128) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    target_type VARCHAR(80),
    target_id VARCHAR(255),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (code, name, description)
VALUES
    ('accountant', 'Kế toán viên', 'Thực hiện đối soát hóa đơn, tải chứng từ và theo dõi nhật ký nghiệp vụ.'),
    ('chief_accountant', 'Kế toán trưởng', 'Theo dõi tổng quan, phê duyệt đối soát và cấu hình quy trình.')
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

INSERT INTO permissions (code, name, description)
VALUES
    ('reconciliation.view', 'Xem đối soát', 'Xem danh sách và chi tiết hồ sơ đối soát.'),
    ('reconciliation.upload', 'Tải chứng từ', 'Tải hóa đơn và chứng từ lên hệ thống.'),
    ('reconciliation.approve', 'Phê duyệt đối soát', 'Phê duyệt hoặc từ chối hồ sơ đối soát.'),
    ('audit.view', 'Xem nhật ký', 'Xem nhật ký thao tác trong hệ thống.'),
    ('settings.manage', 'Quản lý cấu hình', 'Cấu hình ngưỡng và quy trình đối soát.')
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'reconciliation.view',
    'reconciliation.upload',
    'audit.view'
)
WHERE r.code = 'accountant'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
    'reconciliation.view',
    'reconciliation.approve',
    'audit.view',
    'settings.manage'
)
WHERE r.code = 'chief_accountant'
ON CONFLICT DO NOTHING;

INSERT INTO users (
    email,
    password_hash,
    full_name,
    role_id,
    department,
    employee_code,
    date_of_birth,
    address,
    citizen_id,
    phone,
    avatar_url,
    status
)
SELECT
    'accountant@docusync.ai',
    crypt('123456', gen_salt('bf')),
    'Nguyễn Thị Lan',
    r.id,
    'Phòng Kế toán - Tài chính',
    'ACC-001',
    DATE '1995-04-12',
    'Quận Cầu Giấy, Hà Nội',
    '001195000001',
    '0901000001',
    NULL,
    'ACTIVE'
FROM roles r
WHERE r.code = 'accountant'
ON CONFLICT (email) DO UPDATE
SET
    password_hash = crypt('123456', gen_salt('bf')),
    full_name = EXCLUDED.full_name,
    role_id = EXCLUDED.role_id,
    department = EXCLUDED.department,
    employee_code = EXCLUDED.employee_code,
    date_of_birth = EXCLUDED.date_of_birth,
    address = EXCLUDED.address,
    citizen_id = EXCLUDED.citizen_id,
    phone = EXCLUDED.phone,
    avatar_url = EXCLUDED.avatar_url,
    status = EXCLUDED.status,
    updated_at = NOW();

INSERT INTO users (
    email,
    password_hash,
    full_name,
    role_id,
    department,
    employee_code,
    date_of_birth,
    address,
    citizen_id,
    phone,
    avatar_url,
    status
)
SELECT
    'chief.accountant@docusync.ai',
    crypt('123456', gen_salt('bf')),
    'Trần Văn Minh',
    r.id,
    'Phòng Kế toán - Tài chính',
    'CHIEF-001',
    DATE '1989-09-20',
    'Quận Nam Từ Liêm, Hà Nội',
    '001189000002',
    '0901000002',
    NULL,
    'ACTIVE'
FROM roles r
WHERE r.code = 'chief_accountant'
ON CONFLICT (email) DO UPDATE
SET
    password_hash = crypt('123456', gen_salt('bf')),
    full_name = EXCLUDED.full_name,
    role_id = EXCLUDED.role_id,
    department = EXCLUDED.department,
    employee_code = EXCLUDED.employee_code,
    date_of_birth = EXCLUDED.date_of_birth,
    address = EXCLUDED.address,
    citizen_id = EXCLUDED.citizen_id,
    phone = EXCLUDED.phone,
    avatar_url = EXCLUDED.avatar_url,
    status = EXCLUDED.status,
    updated_at = NOW();
