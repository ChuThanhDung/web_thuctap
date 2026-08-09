--
-- PostgreSQL database dump
--

\restrict KxBsjLyC5ubcbUHiGquNlsnKaivCPkijogWO6YeaySca8KnEhV4dPvY7qAPSfOB

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.audit_logs (
    id bigint NOT NULL,
    user_id uuid,
    action character varying(80) NOT NULL,
    target_type character varying(80),
    target_id character varying(255),
    details jsonb,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO admin;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: admin
--

CREATE SEQUENCE public.audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_id_seq OWNER TO admin;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: admin
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: goods_receipt_note_items; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.goods_receipt_note_items (
    id uuid NOT NULL,
    grn_id uuid NOT NULL,
    item_sku character varying(50),
    item_name character varying(255),
    unit character varying(20),
    qty numeric(15,4)
);


ALTER TABLE public.goods_receipt_note_items OWNER TO admin;

--
-- Name: goods_receipt_notes; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.goods_receipt_notes (
    id uuid NOT NULL,
    grn_number character varying(50) NOT NULL,
    po_number character varying(50),
    supplier_name character varying(255),
    supplier_tax_id character varying(20),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.goods_receipt_notes OWNER TO admin;

--
-- Name: line_items; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.line_items (
    id uuid NOT NULL,
    case_id uuid NOT NULL,
    row_index integer NOT NULL,
    item_sku character varying(50),
    item_name character varying(255),
    unit character varying(20),
    inv_qty numeric(15,4),
    po_qty numeric(15,4),
    grn_qty numeric(15,4),
    inv_unit_price numeric(18,2),
    po_unit_price numeric(18,2),
    vat_rate_pct integer,
    diff_type character varying(20),
    diff_note text
);


ALTER TABLE public.line_items OWNER TO admin;

--
-- Name: password_reset_otps; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.password_reset_otps (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    otp_hash character varying(128) NOT NULL,
    reset_token_hash character varying(128),
    expires_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.password_reset_otps OWNER TO admin;

--
-- Name: permissions; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.permissions OWNER TO admin;

--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.purchase_order_items (
    id uuid NOT NULL,
    po_id uuid NOT NULL,
    item_sku character varying(50),
    item_name character varying(255),
    unit character varying(20),
    qty numeric(15,4),
    unit_price numeric(18,2)
);


ALTER TABLE public.purchase_order_items OWNER TO admin;

--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.purchase_orders (
    id uuid NOT NULL,
    po_number character varying(50) NOT NULL,
    supplier_name character varying(255),
    supplier_tax_id character varying(20),
    buyer_name character varying(255),
    total_amount numeric(18,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.purchase_orders OWNER TO admin;

--
-- Name: reconciliation_cases; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.reconciliation_cases (
    id uuid NOT NULL,
    case_number character varying(20) NOT NULL,
    invoice_number character varying(50),
    po_number character varying(50),
    grn_number character varying(50),
    partner_name character varying(255),
    partner_tax_id character varying(20),
    case_date date,
    total_amount numeric(18,2),
    status character varying(20) NOT NULL,
    risk_level character varying(10) NOT NULL,
    confidence numeric(5,4),
    ai_note text,
    ai_summary text,
    ai_recommendation text,
    diff_amount numeric(18,2),
    diff_type character varying(20),
    processed_by_id uuid,
    processed_at timestamp with time zone,
    decision character varying(20),
    rejection_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.reconciliation_cases OWNER TO admin;

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.role_permissions OWNER TO admin;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.roles OWNER TO admin;

--
-- Name: thresholds; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.thresholds (
    id uuid NOT NULL,
    category character varying(100) NOT NULL,
    percent_threshold numeric(5,2) NOT NULL,
    absolute_threshold numeric(18,2) NOT NULL,
    updated_by_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.thresholds OWNER TO admin;

--
-- Name: uploaded_files; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.uploaded_files (
    id uuid NOT NULL,
    filename character varying(255) NOT NULL,
    size character varying(50) NOT NULL,
    status character varying(20) NOT NULL,
    progress integer NOT NULL,
    error_message text,
    case_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.uploaded_files OWNER TO admin;

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_token_hash character varying(128) NOT NULL,
    ip_address character varying(45),
    user_agent text,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_sessions OWNER TO admin;

--
-- Name: users; Type: TABLE; Schema: public; Owner: admin
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(100) NOT NULL,
    role_id uuid NOT NULL,
    department character varying(100),
    employee_code character varying(50),
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    date_of_birth date,
    address character varying(255),
    citizen_id character varying(20),
    phone character varying(20),
    avatar_url character varying(500)
);


ALTER TABLE public.users OWNER TO admin;

--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.audit_logs (id, user_id, action, target_type, target_id, details, ip_address, user_agent, created_at) FROM stdin;
1	e4faca71-c430-4e17-a857-b38eda5014db	LOGIN_SUCCESS	USER	e4faca71-c430-4e17-a857-b38eda5014db	{"role": "chief_accountant"}	172.21.0.4	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0	2026-08-07 07:04:56.103276+00
2	e4faca71-c430-4e17-a857-b38eda5014db	LOGIN_SUCCESS	USER	e4faca71-c430-4e17-a857-b38eda5014db	{"role": "chief_accountant"}	172.21.0.4	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0	2026-08-07 08:27:33.497679+00
5	06710574-f4d0-4b0c-8812-ba0130a1cd25	DOCUMENT_UPLOAD_AND_RECONCILE	USER	06710574-f4d0-4b0c-8812-ba0130a1cd25	{"status": "matched", "case_number": "DOC-0103", "diff_amount": "0.0", "detected_type": "invoice", "uploaded_filename": "INV_0000001.xml"}	\N	\N	2026-08-07 09:30:21.961244+00
6	e4faca71-c430-4e17-a857-b38eda5014db	LOGIN_SUCCESS	USER	e4faca71-c430-4e17-a857-b38eda5014db	{"role": "chief_accountant"}	172.21.0.4	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0	2026-08-07 09:48:19.887133+00
7	e4faca71-c430-4e17-a857-b38eda5014db	CASE_REJECTED	USER	e4faca71-c430-4e17-a857-b38eda5014db	{"note": "s", "decision": "rejected", "case_number": "DOC-0005"}	\N	\N	2026-08-07 09:59:29.45874+00
8	e4faca71-c430-4e17-a857-b38eda5014db	CASE_REJECTED	USER	e4faca71-c430-4e17-a857-b38eda5014db	{"note": "ss", "decision": "rejected", "case_number": "DOC-0012"}	\N	\N	2026-08-07 10:00:14.77338+00
\.


--
-- Data for Name: goods_receipt_note_items; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.goods_receipt_note_items (id, grn_id, item_sku, item_name, unit, qty) FROM stdin;
f66abe69-8c81-48c4-ae0a-2870b1c436dd	b812e3c2-5240-47b7-b8ab-c95249548785	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	50.0000
0a07101d-1384-4143-861d-ca499b445962	9ae7a196-ff5d-40ef-9910-bfcc038fbbdb	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	500.0000
b08a63ba-47ef-424a-a9e8-88c4167068c9	3149cc65-f26a-4b5b-a948-26df2af19a40	SKU-QDT-003	Quần đồng phục tài xế	PCE	215.0000
2e6cb310-34ed-4827-896b-db8025b15e1d	ae3f29f0-59a4-4ae8-9bc8-30e179a48c23	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	300.0000
b8fc45a3-2a16-4b10-8141-732e72a48abf	aac293b9-2ed3-41b1-94ee-aacac129a020	SKU-CAM-HT	Camera hành trình gắn xe	PCE	1500.0000
282d5e28-64e0-4038-8121-1590b42a7d19	c827e374-2b7c-4eca-9b74-b782ccb9b10e	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	500.0000
1ab7257b-58de-475d-bbb6-42332e9c7422	e673b43d-e66f-47f2-93a0-01d6de490e0e	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	10.0000
438a8c51-aad1-41e5-92c4-d90b0bef1edb	e5ff0b8a-69fd-4eb2-a11a-e6678c0445c3	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	300.0000
97e6cbfc-b67f-4522-bc01-48c710de0368	1a8b5b6b-4aa4-42e0-b882-405aa9a24aa8	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	1500.0000
cc454d00-21b1-44dd-ac2c-5b8a306f09c9	255e9693-8e37-4c18-b53b-323133f33469	SKU-LOP-008	Lốp xe máy loại thường	PCE	20.0000
714da697-e800-4e30-a026-86fa4a7dd0de	61b48cab-4946-4cbf-adb2-0204d03745e0	SKU-ACQ-009	Ắc quy xe máy	PCE	300.0000
df9332ad-c6ee-454a-a9f3-d2cd4be57934	19953f47-83d0-4df8-ab1c-92d2ffe5ab29	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	30.0000
733748cc-fe05-452a-ad3a-7f01f22ccff9	b141c9bf-c09e-41c6-bd96-d2e439c1ed86	SKU-VPP-011	Mực in laser	PCE	20.0000
a4b23ca5-6e30-4df4-be4a-4e6d56ee0c44	26df19a4-518e-415b-9d33-378f0bf06799	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	100.0000
991cd7d3-1fe3-4364-bbee-c6e9d23b328b	7615d6a1-5888-4f53-b949-ab76244a9afe	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	100.0000
b2567b90-a858-4444-905b-1a5c9042a7cd	99133ee0-5d88-4acf-9fec-9ac55b7deb45	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	1000.0000
2a460caf-d2f4-4af4-aadc-6566bbfede16	cce432e7-779f-4fad-9e02-00033d0dbd0e	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	100.0000
09a0545c-1c6e-44e4-9176-e0a93daff51d	3135dc7c-c241-4435-9052-a514b9d6f9d9	SKU-QDT-003	Quần đồng phục tài xế	PCE	30.0000
29593316-2e60-41c9-82ce-f58f4a0b9ca4	5280f2e7-c477-4ecf-8c89-7c99a8e821d7	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	500.0000
6fef87bf-6123-4b81-a1bf-5bf4b6820b96	bb7c4ef4-a43a-4695-937e-2473bd4b37c8	SKU-CAM-HT	Camera hành trình gắn xe	PCE	30.0000
5e67f3b8-54e2-456a-9490-40d712bfc980	93526046-b0e9-4239-886d-412b6266110d	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	1500.0000
c15320a9-1bcb-41a9-8479-2ab91a742125	6e6b9a95-17bc-428f-8367-3e51a48b56ca	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	2000.0000
87ebc73e-a9e4-4a85-8a6d-6a722942679f	a67d9ab8-135d-44eb-bd9d-4baa7d92408d	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	20.0000
97c5a5f8-e926-4b37-ae25-fd70a575892b	4e2729b1-568e-4a93-a520-b78268558982	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	500.0000
858dbe81-47b9-4d57-a006-f5914904cf78	f32e0ca7-66d9-47bc-86be-48275f17609a	SKU-LOP-008	Lốp xe máy loại thường	PCE	30.0000
f63326a3-1e76-4df4-a37a-98032db7523f	34b060db-429e-4d1f-9912-bb494e70c583	SKU-ACQ-009	Ắc quy xe máy	PCE	10.0000
7384bf2d-3275-46b6-baab-aa37c7095b63	be0587f5-ea40-45e0-81e7-e681ea7f61a0	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	1500.0000
a37aaaf6-8d6b-4c5f-9963-0b3df40d64ea	907cf106-bc29-4fdd-b5c4-d9b8067ccbe0	SKU-VPP-011	Mực in laser	PCE	800.0000
280727aa-0e04-4f63-b058-95a84d00c5e8	818ccc7a-248d-40e0-a197-9d1ed8cc6c59	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	150.0000
2a5a500d-2def-4989-9844-71205bd29186	117b0944-a811-46e7-ae49-96fbf7742f74	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	300.0000
951a8113-30a1-42fc-b23a-b3dd8a479e09	14fa2433-2ecf-42af-b9ab-3ef0585e142d	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	150.0000
583796e4-c76f-4de4-b897-bf236b248548	702e1acf-80bf-4171-849a-db128879a54f	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	20.0000
d1f85d67-ae48-4cd6-9710-f92798f5f327	b93122a3-11de-43cc-b91d-338e11974560	SKU-QDT-003	Quần đồng phục tài xế	PCE	112.0000
be540e1e-955e-4d0b-8b97-f2cd3b2dc5ec	8dc0a813-d11b-42ea-9fb7-379c3e6c2fe4	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	10.0000
c1b2ed4a-0986-48ea-aaba-d1571d40e09b	1ecab83e-c3ff-4883-b168-6575ee0e92cd	SKU-CAM-HT	Camera hành trình gắn xe	PCE	50.0000
0eaf898d-5611-4f07-ac83-ffc2355a7f47	a0c94ebc-c1d3-43e2-941d-d905efc6ebd6	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	500.0000
e6034df4-ea30-4701-97e3-455016b291d0	16f0f029-9757-409c-a594-6ff5a59cca06	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	10.0000
ec6236bd-9ebc-42f5-837f-e579459793d6	47b0d67b-d42c-40e3-a901-98d36a47eb4c	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	1500.0000
1c1170ad-4af1-4f8b-9fc0-a8b919f5c047	1279d695-a4c8-4245-875a-4b2c3859dcb8	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	20.0000
44dad562-fd92-4818-8e30-06f164fa4ec0	4bae4af6-0b58-406c-ac40-f94309fcd2e8	SKU-LOP-008	Lốp xe máy loại thường	PCE	500.0000
0d1380d9-a099-489d-ada0-438ea86b1869	d704baab-3e42-461f-9b3d-8f061d74214c	SKU-ACQ-009	Ắc quy xe máy	PCE	30.0000
575cef1e-5649-4b63-9939-945abe43c14c	9788b81e-450a-41b7-a994-5ba95689185b	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	229.0000
cef48bf0-8649-4696-a85d-9a2108eb103d	dc643e76-60bc-4253-b54a-2f2f2c6a91f6	SKU-VPP-011	Mực in laser	PCE	300.0000
c7224e13-0693-40c6-a3f0-851d87dada05	d31b54e4-1e14-4482-8417-0718c70e7730	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	2000.0000
af0cdcc1-bacd-4451-8e15-b66013a0e4a0	18d6e342-f7b3-44d8-8a7d-efe7b2bc52a6	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	30.0000
c458eef6-4ec4-4b2d-9108-dfc969e73fee	a85c5abf-63ed-4b6f-b15d-c8456d5de71d	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	2000.0000
bfca0be4-d37b-486c-8088-0d448368660c	cbb0317c-c2be-485f-beb8-de39fc55b4f9	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	1500.0000
c6904d24-4a57-4503-893f-9754a661354d	4f47776c-d016-4ffe-affb-f9c4a8de9518	SKU-QDT-003	Quần đồng phục tài xế	PCE	300.0000
3fb2b008-4a39-4a78-ad16-c03bcfa609cc	73903305-a2de-49c2-acc4-55be314b834b	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	100.0000
ef601619-2c83-4645-be21-4ce5e0cb3129	fb120cbf-c4cb-43aa-8f6d-e3f905bb6493	SKU-CAM-HT	Camera hành trình gắn xe	PCE	30.0000
8dc10659-5ede-4dd4-be4c-8f3a80f8b933	f908f07c-b290-47d5-b809-821d88f33731	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	1500.0000
3d762e1f-b432-49a6-ae71-6c1a56a8c421	63571909-822f-4186-b869-cb5d109b259c	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	50.0000
9f1b2d7f-ec16-407c-894c-3958400b3c7c	69279ef1-e3fc-4e6c-9601-05c88ab1a0a4	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	1500.0000
914469ce-98b6-4375-96a0-6fd85a07d1c8	8ba38409-1615-4be1-8269-aa3b92a8f48a	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	800.0000
534b1beb-3357-4101-bec6-1dbd1578f9e0	cfa6fc79-2442-42a7-82b9-9d350947ec6a	SKU-LOP-008	Lốp xe máy loại thường	PCE	100.0000
ce8f0386-1863-44c5-ab01-703e8f25a861	a56825df-456b-447d-a3a7-8dcc68b60aa4	SKU-ACQ-009	Ắc quy xe máy	PCE	150.0000
c0e5c4d0-cbf7-42bb-92d8-f3e679b3fda9	a8ab4d61-dd85-4e7f-b954-1edac2b8e67f	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	800.0000
6a709b5f-3849-43df-b3da-6c567a46bb4c	e549972a-7a52-4809-bee0-9a75ab0e2829	SKU-VPP-011	Mực in laser	PCE	300.0000
989df966-94f3-406f-93ca-4fe491e9e8b3	1a02449b-cb3e-4883-a704-a3ff515dcc1e	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	200.0000
a0bd5418-5aa2-42ac-8fd3-45b5cc129884	5c86e06a-1f23-4452-9126-9612e891b237	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	300.0000
745da087-1642-44bd-b79c-ecf6b1824825	9aeb4002-8518-4d56-876e-f8a3b713674a	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	1000.0000
a8708555-2285-4a79-bfb3-0a793b31593d	d649e5e7-70d7-4bb8-9dca-8b48dcf33926	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	1500.0000
1f10de4e-7e10-4925-8c51-330634783e0d	bf04dfa6-3a57-4b89-851b-9cec3251d44d	SKU-QDT-003	Quần đồng phục tài xế	PCE	30.0000
4eac810e-d892-43ab-8042-964184c53968	2e93c6b9-3de0-4c0c-8c53-84ff73d15372	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	300.0000
42adb061-af95-4d50-98a1-8dbe02bc2e20	f9c31163-0cc0-4b4d-8071-9262c0d464e0	SKU-CAM-HT	Camera hành trình gắn xe	PCE	800.0000
70c42822-82df-484d-9f63-ea435873c748	e4974db0-6d48-4457-81aa-46a00af38671	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	1000.0000
16b90290-0233-4f0e-988a-ac06090709c3	fe6f89b8-df0d-477e-9e97-b92b1da5072f	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	10.0000
c2775cb4-e901-400f-bfe2-406556884f84	ef6acae9-a837-4ffb-8860-1cbab5cb1514	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	500.0000
9a31d01f-e075-42cd-a478-f27304459538	6d4b695c-bb24-4784-8124-beae37d41808	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	500.0000
04972acc-99a4-4083-892a-78408b791791	a987f6e4-d83a-4f78-8b44-459a4ee1d9fa	SKU-LOP-008	Lốp xe máy loại thường	PCE	300.0000
2369231e-d259-469e-9af6-50738836da89	9983291d-dc0a-4880-90e5-e828143b2829	SKU-ACQ-009	Ắc quy xe máy	PCE	200.0000
424d1882-e196-4203-8dd4-1b5cbc4c1dcb	606012f1-7c00-4531-8960-f318df56c8c3	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	2000.0000
8add47cc-f14a-4511-9f91-ca1ef13cf160	9ab55c55-3ea0-4106-8974-6d2dc84c7349	SKU-VPP-011	Mực in laser	PCE	20.0000
02ce1a6e-49b8-4783-8649-ec2575434428	3d3fd2e6-786b-498d-b228-70559d6e5a08	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	100.0000
1b0b2a9c-5c96-4718-80cf-dbacb8f1f12e	e75b24f3-d4ae-48a2-b909-2bd7796f3d78	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	2000.0000
f0a310a5-aa45-4bd0-93d2-927c70bbf86a	86ad3e51-2a39-4382-ba2b-fd1c239ea10e	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	100.0000
de6d3a16-dedc-4d89-b735-c35c2fb44509	92063a0b-e154-4450-b96d-6131175980df	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	100.0000
717301c2-a372-4c0e-a1ac-b11552f53f93	8986e8fd-9f37-41bd-b2b7-49f2c45dc76d	SKU-QDT-003	Quần đồng phục tài xế	PCE	800.0000
93840459-e804-497f-97ef-3bda6eaf397f	dc013a8e-890f-438e-8ffa-a433578e923b	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	2000.0000
a3c059bf-496e-4906-82fd-1558c3a1a410	1fe196be-d918-445e-b2aa-ddae0c8a2f4b	SKU-CAM-HT	Camera hành trình gắn xe	PCE	100.0000
c1fcfa70-d6db-41de-ba22-1aef3054361b	f0203bd4-e98c-46f5-96fa-0946fe19b281	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	100.0000
759de486-0077-4983-baf6-1607cb447baa	7b1516dc-ed33-4e4b-8b86-05adf967d4c2	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	1439.0000
a090ad45-fab7-465f-9201-4eb1927b409d	5f4a8fa7-24ce-492d-9cd8-eaabe8f99ac4	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	800.0000
e8aabad3-7a97-42ee-849b-d368a8c49db3	58515a85-9289-4c32-8289-9aeeb3f2093b	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	50.0000
2e0b86fa-e560-421d-ae66-5d3e86d7d4e8	ce38b51f-d784-453d-8fd6-618d6478c732	SKU-LOP-008	Lốp xe máy loại thường	PCE	20.0000
fc521c4c-3015-43fd-9f41-19bfbe3ea111	1809f04f-406a-4d1e-b710-f0398df7cc84	SKU-ACQ-009	Ắc quy xe máy	PCE	1131.0000
1b90c905-bdd3-4779-8c35-6f4c17b9b1a7	c0a1d747-79b3-40bd-93d2-cc6623b908ea	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	50.0000
82636ba5-c503-42be-af0c-ebb993cbe7d8	a619dd30-e356-4107-8a88-1416d3ec6bc8	SKU-VPP-011	Mực in laser	PCE	274.0000
f5248268-0328-4828-b197-51068af4de46	fcb92fcc-ba4c-4181-b181-0acf21c91cf1	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	88.0000
3136581d-27f2-46a8-b4fb-89b829e41bbf	5e50caa8-0e6b-4191-872f-8ee8091763b4	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	100.0000
1296a91b-f94b-451d-96cc-822ee98d2938	13b668ad-0334-464f-87b6-67969f44f34d	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	122.0000
26a5edd4-8645-4a18-af45-6dcb4b13ac83	1261a74c-d745-4aad-9082-c7b378aee810	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	276.0000
c3cd0e28-4ba8-4d51-b3f7-0b9c685e76e9	382a054b-09c0-42d4-8c97-6cc31b40bc4c	SKU-QDT-003	Quần đồng phục tài xế	PCE	283.0000
3c78874e-c9ff-4f3d-b3e6-e62316c64ff6	6e1aebf2-765e-426e-93fa-b35fe0fe7b51	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	100.0000
9a1e5264-9270-404f-b3e4-6b6db00bc5f1	5f150e19-6662-4be4-85ac-5c6f2e9e4a4f	SKU-CAM-HT	Camera hành trình gắn xe	PCE	500.0000
619105b4-b2c4-414c-8151-b10f2e1466fa	57af8073-85a2-4951-a616-32388eafa168	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	100.0000
7d0ec18a-8efc-4c94-8096-a6dce7374952	bcb722fc-e657-4960-b343-495605164701	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	20.0000
4e96d782-cf8f-4db6-9f57-b5e788603629	48073111-1140-4b0b-8415-d8ddf947a08f	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	1000.0000
55cc106e-6a75-4882-8772-97661339fc1c	025d36de-ff34-4176-ae2e-02a202c2e48b	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	200.0000
1c96b247-4daa-4d1d-b6eb-bd5d82f3ce7b	b3b67b51-e805-4dc6-be83-9b2a29126150	SKU-LOP-008	Lốp xe máy loại thường	PCE	1000.0000
\.


--
-- Data for Name: goods_receipt_notes; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.goods_receipt_notes (id, grn_number, po_number, supplier_name, supplier_tax_id, created_at, updated_at) FROM stdin;
b812e3c2-5240-47b7-b8ab-c95249548785	GRN-2026-000001	PO-2026-000001	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
9ae7a196-ff5d-40ef-9910-bfcc038fbbdb	GRN-2026-000002	PO-2026-000002	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
3149cc65-f26a-4b5b-a948-26df2af19a40	GRN-2026-000003	PO-2026-000003	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
ae3f29f0-59a4-4ae8-9bc8-30e179a48c23	GRN-2026-000004	PO-2026-000004	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
aac293b9-2ed3-41b1-94ee-aacac129a020	GRN-2026-000005	PO-2026-000005	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
c827e374-2b7c-4eca-9b74-b782ccb9b10e	GRN-2026-000006	PO-2026-000006	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
e673b43d-e66f-47f2-93a0-01d6de490e0e	GRN-2026-000007	PO-2026-000007	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
e5ff0b8a-69fd-4eb2-a11a-e6678c0445c3	GRN-2026-000008	PO-2026-000008	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
1a8b5b6b-4aa4-42e0-b882-405aa9a24aa8	GRN-2026-000009	PO-2026-000009	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
255e9693-8e37-4c18-b53b-323133f33469	GRN-2026-000010	PO-2026-000010	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
61b48cab-4946-4cbf-adb2-0204d03745e0	GRN-2026-000011	PO-2026-000011	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
19953f47-83d0-4df8-ab1c-92d2ffe5ab29	GRN-2026-000012	PO-2026-000012	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
b141c9bf-c09e-41c6-bd96-d2e439c1ed86	GRN-2026-000013	PO-2026-000013	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
26df19a4-518e-415b-9d33-378f0bf06799	GRN-2026-000014	PO-2026-000014	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
7615d6a1-5888-4f53-b949-ab76244a9afe	GRN-2026-000015	PO-2026-000015	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
99133ee0-5d88-4acf-9fec-9ac55b7deb45	GRN-2026-000016	PO-2026-000016	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
cce432e7-779f-4fad-9e02-00033d0dbd0e	GRN-2026-000017	PO-2026-000017	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
3135dc7c-c241-4435-9052-a514b9d6f9d9	GRN-2026-000018	PO-2026-000018	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
5280f2e7-c477-4ecf-8c89-7c99a8e821d7	GRN-2026-000019	PO-2026-000019	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
bb7c4ef4-a43a-4695-937e-2473bd4b37c8	GRN-2026-000020	PO-2026-000020	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
93526046-b0e9-4239-886d-412b6266110d	GRN-2026-000021	PO-2026-000021	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
6e6b9a95-17bc-428f-8367-3e51a48b56ca	GRN-2026-000022	PO-2026-000022	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
a67d9ab8-135d-44eb-bd9d-4baa7d92408d	GRN-2026-000023	PO-2026-000023	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
4e2729b1-568e-4a93-a520-b78268558982	GRN-2026-000024	PO-2026-000024	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
f32e0ca7-66d9-47bc-86be-48275f17609a	GRN-2026-000025	PO-2026-000025	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
34b060db-429e-4d1f-9912-bb494e70c583	GRN-2026-000026	PO-2026-000026	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
be0587f5-ea40-45e0-81e7-e681ea7f61a0	GRN-2026-000027	PO-2026-000027	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
907cf106-bc29-4fdd-b5c4-d9b8067ccbe0	GRN-2026-000028	PO-2026-000028	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
818ccc7a-248d-40e0-a197-9d1ed8cc6c59	GRN-2026-000029	PO-2026-000029	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
117b0944-a811-46e7-ae49-96fbf7742f74	GRN-2026-000030	PO-2026-000030	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
14fa2433-2ecf-42af-b9ab-3ef0585e142d	GRN-2026-000031	PO-2026-000031	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
702e1acf-80bf-4171-849a-db128879a54f	GRN-2026-000032	PO-2026-000032	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
b93122a3-11de-43cc-b91d-338e11974560	GRN-2026-000033	PO-2026-000033	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
8dc0a813-d11b-42ea-9fb7-379c3e6c2fe4	GRN-2026-000034	PO-2026-000034	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
1ecab83e-c3ff-4883-b168-6575ee0e92cd	GRN-2026-000035	PO-2026-000035	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
a0c94ebc-c1d3-43e2-941d-d905efc6ebd6	GRN-2026-000036	PO-2026-000036	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
16f0f029-9757-409c-a594-6ff5a59cca06	GRN-2026-000037	PO-2026-000037	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
47b0d67b-d42c-40e3-a901-98d36a47eb4c	GRN-2026-000038	PO-2026-000038	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
1279d695-a4c8-4245-875a-4b2c3859dcb8	GRN-2026-000039	PO-2026-000039	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
4bae4af6-0b58-406c-ac40-f94309fcd2e8	GRN-2026-000040	PO-2026-000040	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
d704baab-3e42-461f-9b3d-8f061d74214c	GRN-2026-000041	PO-2026-000041	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
9788b81e-450a-41b7-a994-5ba95689185b	GRN-2026-000042	PO-2026-000042	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
dc643e76-60bc-4253-b54a-2f2f2c6a91f6	GRN-2026-000043	PO-2026-000043	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
d31b54e4-1e14-4482-8417-0718c70e7730	GRN-2026-000044	PO-2026-000044	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
18d6e342-f7b3-44d8-8a7d-efe7b2bc52a6	GRN-2026-000045	PO-2026-000045	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
a85c5abf-63ed-4b6f-b15d-c8456d5de71d	GRN-2026-000046	PO-2026-000046	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
cbb0317c-c2be-485f-beb8-de39fc55b4f9	GRN-2026-000047	PO-2026-000047	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
4f47776c-d016-4ffe-affb-f9c4a8de9518	GRN-2026-000048	PO-2026-000048	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
73903305-a2de-49c2-acc4-55be314b834b	GRN-2026-000049	PO-2026-000049	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
fb120cbf-c4cb-43aa-8f6d-e3f905bb6493	GRN-2026-000050	PO-2026-000050	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
f908f07c-b290-47d5-b809-821d88f33731	GRN-2026-000051	PO-2026-000051	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
63571909-822f-4186-b869-cb5d109b259c	GRN-2026-000052	PO-2026-000052	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
69279ef1-e3fc-4e6c-9601-05c88ab1a0a4	GRN-2026-000053	PO-2026-000053	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
8ba38409-1615-4be1-8269-aa3b92a8f48a	GRN-2026-000054	PO-2026-000054	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
cfa6fc79-2442-42a7-82b9-9d350947ec6a	GRN-2026-000055	PO-2026-000055	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
a56825df-456b-447d-a3a7-8dcc68b60aa4	GRN-2026-000056	PO-2026-000056	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
a8ab4d61-dd85-4e7f-b954-1edac2b8e67f	GRN-2026-000057	PO-2026-000057	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
e549972a-7a52-4809-bee0-9a75ab0e2829	GRN-2026-000058	PO-2026-000058	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
1a02449b-cb3e-4883-a704-a3ff515dcc1e	GRN-2026-000059	PO-2026-000059	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
5c86e06a-1f23-4452-9126-9612e891b237	GRN-2026-000060	PO-2026-000060	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
9aeb4002-8518-4d56-876e-f8a3b713674a	GRN-2026-000061	PO-2026-000061	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
d649e5e7-70d7-4bb8-9dca-8b48dcf33926	GRN-2026-000062	PO-2026-000062	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
bf04dfa6-3a57-4b89-851b-9cec3251d44d	GRN-2026-000063	PO-2026-000063	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
2e93c6b9-3de0-4c0c-8c53-84ff73d15372	GRN-2026-000064	PO-2026-000064	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
f9c31163-0cc0-4b4d-8071-9262c0d464e0	GRN-2026-000065	PO-2026-000065	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
e4974db0-6d48-4457-81aa-46a00af38671	GRN-2026-000066	PO-2026-000066	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
fe6f89b8-df0d-477e-9e97-b92b1da5072f	GRN-2026-000067	PO-2026-000067	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
ef6acae9-a837-4ffb-8860-1cbab5cb1514	GRN-2026-000068	PO-2026-000068	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
6d4b695c-bb24-4784-8124-beae37d41808	GRN-2026-000069	PO-2026-000069	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
a987f6e4-d83a-4f78-8b44-459a4ee1d9fa	GRN-2026-000070	PO-2026-000070	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
9983291d-dc0a-4880-90e5-e828143b2829	GRN-2026-000071	PO-2026-000071	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
606012f1-7c00-4531-8960-f318df56c8c3	GRN-2026-000072	PO-2026-000072	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
9ab55c55-3ea0-4106-8974-6d2dc84c7349	GRN-2026-000073	PO-2026-000073	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
3d3fd2e6-786b-498d-b228-70559d6e5a08	GRN-2026-000074	PO-2026-000074	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
e75b24f3-d4ae-48a2-b909-2bd7796f3d78	GRN-2026-000075	PO-2026-000075	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
86ad3e51-2a39-4382-ba2b-fd1c239ea10e	GRN-2026-000076	PO-2026-000076	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
92063a0b-e154-4450-b96d-6131175980df	GRN-2026-000077	PO-2026-000077	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
8986e8fd-9f37-41bd-b2b7-49f2c45dc76d	GRN-2026-000078	PO-2026-000078	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
dc013a8e-890f-438e-8ffa-a433578e923b	GRN-2026-000079	PO-2026-000079	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
1fe196be-d918-445e-b2aa-ddae0c8a2f4b	GRN-2026-000080	PO-2026-000080	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
f0203bd4-e98c-46f5-96fa-0946fe19b281	GRN-2026-000081	PO-2026-000081	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
7b1516dc-ed33-4e4b-8b86-05adf967d4c2	GRN-2026-000082	PO-2026-000082	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
5f4a8fa7-24ce-492d-9cd8-eaabe8f99ac4	GRN-2026-000083	PO-2026-000083	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
58515a85-9289-4c32-8289-9aeeb3f2093b	GRN-2026-000084	PO-2026-000084	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
ce38b51f-d784-453d-8fd6-618d6478c732	GRN-2026-000085	PO-2026-000085	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
1809f04f-406a-4d1e-b710-f0398df7cc84	GRN-2026-000086	PO-2026-000086	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
c0a1d747-79b3-40bd-93d2-cc6623b908ea	GRN-2026-000087	PO-2026-000087	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
a619dd30-e356-4107-8a88-1416d3ec6bc8	GRN-2026-000088	PO-2026-000088	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
fcb92fcc-ba4c-4181-b181-0acf21c91cf1	GRN-2026-000089	PO-2026-000089	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
5e50caa8-0e6b-4191-872f-8ee8091763b4	GRN-2026-000090	PO-2026-000090	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
13b668ad-0334-464f-87b6-67969f44f34d	GRN-2026-000091	PO-2026-000091	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
1261a74c-d745-4aad-9082-c7b378aee810	GRN-2026-000092	PO-2026-000092	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
382a054b-09c0-42d4-8c97-6cc31b40bc4c	GRN-2026-000093	PO-2026-000093	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
6e1aebf2-765e-426e-93fa-b35fe0fe7b51	GRN-2026-000094	PO-2026-000094	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
5f150e19-6662-4be4-85ac-5c6f2e9e4a4f	GRN-2026-000095	PO-2026-000095	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
57af8073-85a2-4951-a616-32388eafa168	GRN-2026-000096	PO-2026-000096	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
bcb722fc-e657-4960-b343-495605164701	GRN-2026-000097	PO-2026-000097	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
48073111-1140-4b0b-8415-d8ddf947a08f	GRN-2026-000098	PO-2026-000098	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
025d36de-ff34-4176-ae2e-02a202c2e48b	GRN-2026-000099	PO-2026-000099	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
b3b67b51-e805-4dc6-be83-9b2a29126150	GRN-2026-000100	PO-2026-000100	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
\.


--
-- Data for Name: line_items; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.line_items (id, case_id, row_index, item_sku, item_name, unit, inv_qty, po_qty, grn_qty, inv_unit_price, po_unit_price, vat_rate_pct, diff_type, diff_note) FROM stdin;
b75d4aec-5917-483f-ac97-7707443223db	f2fa5494-da04-4bab-860b-00355c612905	1	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	Cái	50.0000	50.0000	50.0000	80000.00	80000.00	10	MATCH	Khớp hoàn toàn
0b578447-c8b8-4008-a20d-c6bee8cf919d	7c865d7a-1984-48ad-a9e5-c888bc24df70	1	SKU-AKD-002	Áo khoác đồng phục (chống nước)	Cái	500.0000	500.0000	500.0000	150000.00	150000.00	10	MATCH	Khớp hoàn toàn
53e9f4c8-675f-4ea4-97ba-2fe0708cff53	daaa6cc4-6712-47d7-bf77-8c3bdce60bd7	1	SKU-QDT-003	Quần đồng phục tài xế	Cái	300.0000	300.0000	215.0000	120000.00	120000.00	10	QTY_DIFF	Số lượng lệch: Hóa đơn (300.0) vs PO (300.0) vs Thực nhận (215.0)
9eefcfd6-f361-4e87-9ca3-3d84d75a02fd	0202bc06-6890-4f38-9a98-d3ff61fd446b	1	SKU-GPS-4G	Thiết bị định vị GPS 4G	Bộ	300.0000	300.0000	300.0000	1000000.00	1000000.00	10	MATCH	Khớp hoàn toàn
d12ba1b1-9720-48af-a1c3-a5faacf84fc0	139a2769-9d7f-4688-8eff-6de43b073a1c	1	SKU-CAM-HT	Camera hành trình gắn xe	Bộ	1500.0000	1500.0000	1500.0000	850000.00	850000.00	10	MATCH	Khớp hoàn toàn
eb7105a7-aca1-4a7d-9148-ed82221d06ca	f511b76b-8f11-462d-ae98-ff436b72232d	1	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	Cái	500.0000	500.0000	500.0000	2500000.00	2500000.00	10	MATCH	Khớp hoàn toàn
687a952c-4542-4ebd-bc9f-f2ac50a43942	f2af4278-8812-44da-884f-c5fa14e55488	1	SKU-DCL-003	Decal phản quang dán sườn xe	Tấm	10.0000	10.0000	10.0000	45000.00	45000.00	10	MATCH	Khớp hoàn toàn
aeed05a3-5072-4e3c-9f82-59ad0f7e3b15	190449b5-a965-49b5-87cc-b01f31bd7964	1	SKU-BHT-006	Bảng hiệu taplo gắn xe	Cái	300.0000	300.0000	300.0000	35000.00	35000.00	10	MATCH	Khớp hoàn toàn
457b10f6-5761-43ff-82fe-3d619c2ac1b5	4d23ef29-450f-42e3-b443-a2bca31a7eb7	1	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	Hộp	1500.0000	1500.0000	1500.0000	95000.00	95000.00	10	MATCH	Khớp hoàn toàn
80ad6ecb-400e-4d5a-bbc2-e93a3a21e5c2	e5a788da-13cf-4c34-ad44-31b7ff7beffd	1	SKU-LOP-008	Lốp xe máy loại thường	Chiếc	20.0000	20.0000	20.0000	320000.00	320000.00	10	MATCH	Khớp hoàn toàn
58bf0546-cae9-4995-9ca0-ebb3f4dddf84	6c830aea-a95e-4d5f-9e17-9b54ce003654	1	SKU-ACQ-009	Ắc quy xe máy	Bình	300.0000	300.0000	300.0000	480000.00	480000.00	8	MATCH	Khớp hoàn toàn
755f5510-884c-47c4-b131-289c503bb90b	ac574ef9-1169-4566-b3e3-9ba0895a75d5	1	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	Thùng	30.0000	30.0000	30.0000	605000.00	550000.00	10	PRICE_DIFF	Đơn giá lệch: Hóa đơn (605000.0) vs PO (550000.0)
c83e9691-3363-47cc-9bb9-3ee52a075118	39f26f13-d452-4868-8428-4ac9d263f208	1	SKU-VPP-011	Mực in laser	Hộp	20.0000	20.0000	20.0000	780000.00	780000.00	10	MATCH	Khớp hoàn toàn
9cdcd997-c5c3-4318-bf38-08507a621c54	c5ce9c69-4b73-4156-b68f-337c010b557c	1	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	Can	100.0000	100.0000	100.0000	180000.00	180000.00	10	MATCH	Khớp hoàn toàn
4de63476-2b51-425d-a3da-875b89842c8d	9c5139f4-b450-46ce-b174-82e4790d7d4c	1	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	Hộp	100.0000	100.0000	100.0000	65000.00	65000.00	10	MATCH	Khớp hoàn toàn
89aa09e3-362a-47fb-b06f-6ee4d1f26fb0	6d8f8904-1d14-4115-a589-17728638ce2a	1	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	Cái	1000.0000	1000.0000	1000.0000	80000.00	80000.00	10	MATCH	Khớp hoàn toàn
c2ffe318-90ab-4592-96d5-ea9aac46866b	6f5cf06b-bde3-43a1-a407-c7e9be7f0ec4	1	SKU-AKD-002	Áo khoác đồng phục (chống nước)	Cái	100.0000	100.0000	100.0000	150000.00	150000.00	10	MATCH	Khớp hoàn toàn
64934141-d168-45d1-86cd-2d9c149813d8	9d86ece0-4233-4e8e-b921-9ea8d6b8f3ba	1	SKU-QDT-003	Quần đồng phục tài xế	Cái	30.0000	30.0000	30.0000	120000.00	120000.00	8	MATCH	Khớp hoàn toàn
f4e3fb47-c853-446c-8257-b383ca3f6e81	604181b8-e356-4e34-9314-ae8470062d1b	1	SKU-GPS-4G	Thiết bị định vị GPS 4G	Bộ	500.0000	500.0000	500.0000	1000000.00	1000000.00	10	MATCH	Khớp hoàn toàn
b8df1bcd-b55f-49a9-a730-fba473106cf1	b1aac817-dd9f-4a3e-acdf-28522e83ff4c	1	SKU-CAM-HT	Camera hành trình gắn xe	Bộ	30.0000	30.0000	30.0000	850000.00	850000.00	10	MATCH	Khớp hoàn toàn
cd4330a0-e69c-48c9-b277-a0f0770ff032	ce937e79-6cb5-49c7-af0a-3b5e2cf511bf	1	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	Cái	1500.0000	1500.0000	1500.0000	2500000.00	2500000.00	10	MATCH	Khớp hoàn toàn
e47fa4b9-64ca-4972-9d2b-6114ccb919e0	ccfe4b58-3415-4eb3-8503-b7ab31bf498f	1	SKU-DCL-003	Decal phản quang dán sườn xe	Tấm	2000.0000	2000.0000	2000.0000	45000.00	45000.00	10	MATCH	Khớp hoàn toàn
916e0953-6b0c-4b3e-9ddb-25a24c9552ea	12d09fc1-f035-4df0-8053-1f5509db6c69	1	SKU-BHT-006	Bảng hiệu taplo gắn xe	Cái	20.0000	20.0000	20.0000	35000.00	35000.00	8	MATCH	Khớp hoàn toàn
a481457d-99e0-4af6-bad9-e568de191a14	6e0b1d8c-055c-4dba-836f-5443fdc91e34	1	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	Hộp	500.0000	500.0000	500.0000	95000.00	95000.00	10	MATCH	Khớp hoàn toàn
a73fe751-d045-43d1-817a-6483e78887b8	2639fd70-670d-440a-adcd-5ce56bea1a01	1	SKU-LOP-008	Lốp xe máy loại thường	Chiếc	30.0000	30.0000	30.0000	320000.00	320000.00	10	MATCH	Khớp hoàn toàn
96fed6d1-d3d6-4828-8b68-2e095540c1aa	0825fcfc-950b-495e-bbcd-209ed7b1a613	1	SKU-ACQ-009	Ắc quy xe máy	Bình	10.0000	10.0000	10.0000	480000.00	480000.00	10	MATCH	Khớp hoàn toàn
75fe4a1d-0efb-4c04-87b9-1d546942bc2e	2cf0288e-a1c2-440a-9328-d82d85fee944	1	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	Thùng	1500.0000	1500.0000	1500.0000	550000.00	550000.00	10	MATCH	Khớp hoàn toàn
7c233265-e107-4ca0-834a-1062e9d5c2e8	06342582-625e-4ee7-aab2-17ea14b73fb4	1	SKU-VPP-011	Mực in laser	Hộp	800.0000	800.0000	800.0000	780000.00	780000.00	8	MATCH	Khớp hoàn toàn
f4fa0369-1a11-4a32-ad4d-10571605f136	0bc9e304-fb9b-4eef-b711-bf4fd1b7617a	1	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	Can	150.0000	150.0000	150.0000	180000.00	180000.00	10	MATCH	Khớp hoàn toàn
172e8c76-a59d-4c6d-9e90-b61c0f894ad0	8c7b0272-a67a-4f5c-b131-380f9bf0e6df	1	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	Hộp	300.0000	300.0000	300.0000	65000.00	65000.00	10	MATCH	Khớp hoàn toàn
25ffb0d1-5c1f-4e34-a193-62fb51848d33	bf99c499-827c-4c08-8214-e8d822ab08bc	1	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	Cái	150.0000	150.0000	150.0000	80000.00	80000.00	10	MATCH	Khớp hoàn toàn
9458a17f-6f16-4d5f-b055-a830a43bc895	20fb5d17-ba8c-4f07-970e-2ca1ad6e4779	1	SKU-AKD-002	Áo khoác đồng phục (chống nước)	Cái	20.0000	20.0000	20.0000	165000.00	150000.00	10	PRICE_DIFF	Đơn giá lệch: Hóa đơn (165000.0) vs PO (150000.0)
f8afef89-c546-471d-ad00-df8323d29c6b	74d9f840-95e6-4a53-8845-08bf67fea424	1	SKU-QDT-003	Quần đồng phục tài xế	Cái	150.0000	150.0000	112.0000	120000.00	120000.00	10	QTY_DIFF	Số lượng lệch: Hóa đơn (150.0) vs PO (150.0) vs Thực nhận (112.0)
7d086500-beec-49c0-af9b-7d1ba78808ea	829d2ae8-290e-4fa4-bcff-5d898703ea80	1	SKU-GPS-4G	Thiết bị định vị GPS 4G	Bộ	10.0000	10.0000	10.0000	1000000.00	1000000.00	10	MATCH	Khớp hoàn toàn
0c396ce5-0cee-4324-9313-df77d50bdd6f	87bbcf1a-e95e-43df-aa3d-7f2446348540	1	SKU-CAM-HT	Camera hành trình gắn xe	Bộ	50.0000	50.0000	50.0000	850000.00	850000.00	10	MATCH	Khớp hoàn toàn
cbe278a3-2b18-420c-a880-22be1b167aa2	c07477c3-801a-4dcf-b576-bd4362bde0fd	1	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	Cái	500.0000	500.0000	500.0000	2500000.00	2500000.00	10	MATCH	Khớp hoàn toàn
d92faea2-ea5c-4e9e-9339-be28cac5fbbc	b7b33dfc-8506-4674-bac5-15c721e8041b	1	SKU-DCL-003	Decal phản quang dán sườn xe	Tấm	10.0000	10.0000	10.0000	49500.00	45000.00	10	PRICE_DIFF	Đơn giá lệch: Hóa đơn (49500.0) vs PO (45000.0)
48d8e62f-65a1-4e03-94cb-c2bb260d809d	45a88782-2981-49ae-bcf1-063ee969fc87	1	SKU-BHT-006	Bảng hiệu taplo gắn xe	Cái	1500.0000	1500.0000	1500.0000	38500.00	35000.00	10	PRICE_DIFF	Đơn giá lệch: Hóa đơn (38500.0) vs PO (35000.0)
c9aaeb31-e454-4a61-aea8-d97debbedfcf	599e3b98-87c2-4c56-94f1-bcb85db8c37a	1	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	Hộp	20.0000	20.0000	20.0000	95000.00	95000.00	10	MATCH	Khớp hoàn toàn
57abbc88-242b-4b6f-b0f7-ed4743534e74	5901ba4e-dd03-4b5c-9afc-d9595b329a34	1	SKU-LOP-008	Lốp xe máy loại thường	Chiếc	500.0000	500.0000	500.0000	320000.00	320000.00	10	MATCH	Khớp hoàn toàn
54e9b20c-c1c4-46af-9649-61582d98bce8	5e9b092b-f86e-4eee-b8a2-178ad1f8205c	1	SKU-ACQ-009	Ắc quy xe máy	Bình	30.0000	30.0000	30.0000	480000.00	480000.00	10	MATCH	Khớp hoàn toàn
ac255836-fd1e-4d8b-9e93-77a2597b974d	5c63410c-8b60-4733-b38b-b4b6c7561d60	1	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	Thùng	300.0000	300.0000	229.0000	550000.00	550000.00	10	QTY_DIFF	Số lượng lệch: Hóa đơn (300.0) vs PO (300.0) vs Thực nhận (229.0)
929e8bfd-23ea-4caf-a015-2f0443994f01	e66dc961-ab79-43f2-a73a-134596516f99	1	SKU-VPP-011	Mực in laser	Hộp	300.0000	300.0000	300.0000	780000.00	780000.00	10	MATCH	Khớp hoàn toàn
284fb662-beef-42df-9044-f1780e20a5bd	ae4f05a7-a754-4df2-87fe-6608bedf0cfd	1	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	Can	2000.0000	2000.0000	2000.0000	180000.00	180000.00	10	MATCH	Khớp hoàn toàn
e207ed93-4c2d-43ab-966b-4aa119451d59	c01af754-389c-4941-ae29-97e39d458120	1	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	Hộp	30.0000	30.0000	30.0000	65000.00	65000.00	10	MATCH	Khớp hoàn toàn
de15c6bd-36db-458a-aed7-40bbce2e5b37	0a205823-165a-40cb-bbe6-00219455313f	1	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	Cái	2000.0000	2000.0000	2000.0000	80000.00	80000.00	10	MATCH	Khớp hoàn toàn
06c8e98c-7307-4fd4-8a08-5ee3f366883e	4e3cf4e8-4f67-4999-98c2-657b26a6d2a2	1	SKU-AKD-002	Áo khoác đồng phục (chống nước)	Cái	1500.0000	1500.0000	1500.0000	150000.00	150000.00	10	MATCH	Khớp hoàn toàn
2461a26b-1416-44dc-9dcb-44c1d7db7a58	82488810-fd3f-4fe4-869f-44d61f681a73	1	SKU-QDT-003	Quần đồng phục tài xế	Cái	300.0000	300.0000	300.0000	120000.00	120000.00	10	MATCH	Khớp hoàn toàn
e01d975b-6b35-4b78-9da5-0ce038b68b97	acebc132-b8f1-4a9d-a8ff-bbe7390b7ff1	1	SKU-GPS-4G	Thiết bị định vị GPS 4G	Bộ	100.0000	100.0000	100.0000	1000000.00	1000000.00	10	MATCH	Khớp hoàn toàn
74522146-ba2c-407e-b76d-b03ba9c6915d	7e3afc41-d106-4943-b4a1-2450e4a394d6	1	SKU-CAM-HT	Camera hành trình gắn xe	Bộ	30.0000	30.0000	30.0000	935000.00	850000.00	10	PRICE_DIFF	Đơn giá lệch: Hóa đơn (935000.0) vs PO (850000.0)
52e37b26-5013-4aa8-a76e-a03f9e5b21dd	90ee1430-00ab-49aa-a103-2db93ecd8826	1	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	Cái	1500.0000	1500.0000	1500.0000	2750000.00	2500000.00	10	PRICE_DIFF	Đơn giá lệch: Hóa đơn (2750000.0) vs PO (2500000.0)
94f2ddd0-fa94-424c-a3be-683619453650	86b7572c-8e47-4abe-8c54-1bc4a18bf2b6	1	SKU-DCL-003	Decal phản quang dán sườn xe	Tấm	50.0000	50.0000	50.0000	45000.00	45000.00	10	MATCH	Khớp hoàn toàn
d14534ef-902f-41c0-84ec-4917393a6f99	61a716a6-635b-49c5-b2d8-f1667049f72a	1	SKU-BHT-006	Bảng hiệu taplo gắn xe	Cái	1500.0000	1500.0000	1500.0000	38500.00	35000.00	10	PRICE_DIFF	Đơn giá lệch: Hóa đơn (38500.0) vs PO (35000.0)
3c16f1fa-5ffb-4c54-82f1-705fb4c71620	5bd4dcf3-7b50-49ed-849a-cfb7e41a0145	1	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	Hộp	800.0000	800.0000	800.0000	95000.00	95000.00	10	MATCH	Khớp hoàn toàn
c05ef121-48f3-4fda-94a1-0c88e1b7f744	384264ca-20ee-4713-abf6-ec201250de04	1	SKU-LOP-008	Lốp xe máy loại thường	Chiếc	100.0000	100.0000	100.0000	320000.00	320000.00	10	MATCH	Khớp hoàn toàn
08a30615-455b-4791-bdc8-d213a1cb40e8	580659a9-d184-4a2b-b39b-381c034db28b	1	SKU-ACQ-009	Ắc quy xe máy	Bình	150.0000	150.0000	150.0000	480000.00	480000.00	10	MATCH	Khớp hoàn toàn
f61f4687-d587-483b-b25b-dbc881235327	ed95c3bc-d805-46e1-bc1c-be3fae379359	1	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	Thùng	800.0000	800.0000	800.0000	605000.00	550000.00	10	PRICE_DIFF	Đơn giá lệch: Hóa đơn (605000.0) vs PO (550000.0)
14d11a7d-d072-4be8-aa48-00af31750fbc	ab979125-c07d-463c-b0ce-6669b660eba1	1	SKU-VPP-011	Mực in laser	Hộp	300.0000	300.0000	300.0000	780000.00	780000.00	10	MATCH	Khớp hoàn toàn
447cca37-218d-4799-8931-f693372d6bf3	f77bf0e2-bf4b-4896-a758-d2aa90cd739f	1	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	Can	200.0000	200.0000	200.0000	180000.00	180000.00	10	MATCH	Khớp hoàn toàn
b97fe1f6-ce89-47f7-aaa0-344c9a2307d8	fbb46446-77f8-4a89-a796-fd3b8e0d21be	1	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	Hộp	300.0000	300.0000	300.0000	65000.00	65000.00	10	MATCH	Khớp hoàn toàn
fc4fa39f-c9db-4a6b-a3bc-6f3bc52e33ac	b31cb584-16f1-4a9b-8ee1-85c6f48a9e95	1	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	Cái	1000.0000	1000.0000	1000.0000	80000.00	80000.00	10	MATCH	Khớp hoàn toàn
1550c893-27c7-443e-a926-b55c46d943b5	7632103a-25c3-4620-97a1-0143a0d24b53	1	SKU-AKD-002	Áo khoác đồng phục (chống nước)	Cái	1500.0000	1500.0000	1500.0000	150000.00	150000.00	10	MATCH	Khớp hoàn toàn
7f97b8d7-c32c-473e-a5d9-0250a6a4080a	17209e00-13f6-4aa6-a877-ebeddddcff23	1	SKU-QDT-003	Quần đồng phục tài xế	Cái	30.0000	30.0000	30.0000	120000.00	120000.00	10	MATCH	Khớp hoàn toàn
53ba18cc-073d-47df-8c7c-ee057da18574	975e6cd9-8b2b-4ce9-93c8-f178ca2bc7df	1	SKU-GPS-4G	Thiết bị định vị GPS 4G	Bộ	300.0000	300.0000	300.0000	1000000.00	1000000.00	10	MATCH	Khớp hoàn toàn
3c802d99-055c-46ed-b413-34a095b58a88	923677ed-a11b-44c3-9fd2-613dd62b2dec	1	SKU-CAM-HT	Camera hành trình gắn xe	Bộ	800.0000	800.0000	800.0000	850000.00	850000.00	10	MATCH	Khớp hoàn toàn
27f2d0b0-ca62-48d2-b4c8-72a3b35bdca2	926f21e5-0602-43f8-a683-da31b11fb7cb	1	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	Cái	1000.0000	1000.0000	1000.0000	2500000.00	2500000.00	10	MATCH	Khớp hoàn toàn
f13172c7-1e58-4ed9-b8d3-bd19e3d99385	8f9646ef-fdd1-48c6-a6e1-8c80b647cd8d	1	SKU-DCL-003	Decal phản quang dán sườn xe	Tấm	10.0000	10.0000	10.0000	45000.00	45000.00	10	MATCH	Khớp hoàn toàn
409c8598-4bc5-4a91-87ee-2690e8025e46	4501f76a-afbf-4db2-814c-890c03ebb12d	1	SKU-BHT-006	Bảng hiệu taplo gắn xe	Cái	500.0000	500.0000	500.0000	35000.00	35000.00	10	MATCH	Khớp hoàn toàn
dd236536-a694-4a60-831f-628a82164093	3f9f6dd2-7a32-4a85-9b45-e35a1ae379fe	1	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	Hộp	500.0000	500.0000	500.0000	95000.00	95000.00	10	MATCH	Khớp hoàn toàn
cb16d4f2-bac2-4692-8482-92d223961169	2db905e7-0e69-4776-9471-8d77c47ac3fe	1	SKU-LOP-008	Lốp xe máy loại thường	Chiếc	300.0000	300.0000	300.0000	320000.00	320000.00	10	MATCH	Khớp hoàn toàn
f05b9d3c-7c03-4fdb-ab75-e8fd682148ef	9d2cae70-da3c-4255-a70b-2b71267c00d5	1	SKU-ACQ-009	Ắc quy xe máy	Bình	200.0000	200.0000	200.0000	480000.00	480000.00	10	MATCH	Khớp hoàn toàn
9131dafe-0294-45a9-a4cb-c8ef3d863cdd	02e36fe5-bcbd-421b-ba41-f6882b35fde3	1	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	Thùng	2000.0000	2000.0000	2000.0000	550000.00	550000.00	10	MATCH	Khớp hoàn toàn
092b7130-8a2a-481d-b76f-cb8b8095e7fb	708b1d7c-8b55-4081-bb49-0194ed0b87d5	1	SKU-VPP-011	Mực in laser	Hộp	20.0000	20.0000	20.0000	780000.00	780000.00	10	MATCH	Khớp hoàn toàn
1d791a92-7edf-4cc2-9181-5e47c8a2e52d	fe45e2de-a819-4dda-a63d-cbb9674201f0	1	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	Can	100.0000	100.0000	100.0000	180000.00	180000.00	10	MATCH	Khớp hoàn toàn
12328d7c-0968-43f5-811d-ec6746fc170b	def41e1e-d370-41fc-95fb-5d818a7332ce	1	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	Hộp	2000.0000	2000.0000	2000.0000	71500.00	65000.00	10	PRICE_DIFF	Đơn giá lệch: Hóa đơn (71500.0) vs PO (65000.0)
8687a4df-ea1f-4cea-a018-99a7a0aa7df4	93b25c35-b8f0-4021-b39a-4a543a2dbbe4	1	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	Cái	100.0000	100.0000	100.0000	80000.00	80000.00	10	MATCH	Khớp hoàn toàn
f384aaff-d701-4d1a-beec-778950d1434f	c2a91e09-c919-4d02-8d6f-8d7c11a79db3	1	SKU-AKD-002	Áo khoác đồng phục (chống nước)	Cái	100.0000	100.0000	100.0000	150000.00	150000.00	10	MATCH	Khớp hoàn toàn
82f78690-8d99-42ce-ab18-c864f0878bcd	e8550b5c-f86c-40d2-b1be-7da606f24253	1	SKU-QDT-003	Quần đồng phục tài xế	Cái	800.0000	800.0000	800.0000	120000.00	120000.00	10	MATCH	Khớp hoàn toàn
704ceb11-cd35-4e4a-8611-0ec79794c2cb	214cc9ba-ab32-4eeb-ae53-0e7d0a24e685	1	SKU-GPS-4G	Thiết bị định vị GPS 4G	Bộ	2000.0000	2000.0000	2000.0000	1000000.00	1000000.00	10	MATCH	Khớp hoàn toàn
e4f64967-da2b-4f11-895c-735563a8bf7b	83a2cc69-bde7-4fec-bcb2-97d700f7ffb5	1	SKU-CAM-HT	Camera hành trình gắn xe	Bộ	100.0000	100.0000	100.0000	850000.00	850000.00	10	MATCH	Khớp hoàn toàn
36608415-b64f-4640-9057-3e3696893329	95d79de4-f5c4-4b27-9414-ab867ec1a952	1	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	Cái	100.0000	100.0000	100.0000	2500000.00	2500000.00	10	MATCH	Khớp hoàn toàn
f3aab9ea-8664-46bc-bf7e-39046660a059	bcf7bfe8-f01b-449e-a9c6-2dc31ee02fd7	1	SKU-DCL-003	Decal phản quang dán sườn xe	Tấm	2000.0000	2000.0000	1439.0000	45000.00	45000.00	10	QTY_DIFF	Số lượng lệch: Hóa đơn (2000.0) vs PO (2000.0) vs Thực nhận (1439.0)
8ffeae8e-a09e-41c9-9e7c-c1f1824121f4	0370f3b3-5e03-43b3-ad8b-95c190cc7278	1	SKU-BHT-006	Bảng hiệu taplo gắn xe	Cái	800.0000	800.0000	800.0000	35000.00	35000.00	10	MATCH	Khớp hoàn toàn
23d57ba1-3145-4fc9-8b90-53904266a17b	b3855e98-bf43-434b-a120-8a14543924ab	1	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	Hộp	50.0000	50.0000	50.0000	95000.00	95000.00	10	MATCH	Khớp hoàn toàn
8a0d2149-0d13-4a25-b6be-b4e653960107	9945be40-558c-4a31-8801-f30c448322a2	1	SKU-LOP-008	Lốp xe máy loại thường	Chiếc	20.0000	20.0000	20.0000	320000.00	320000.00	10	MATCH	Khớp hoàn toàn
0aff8f89-e5dc-4273-8afc-2c5073c42c7a	da3004fa-b159-4061-9497-cb4f7437131f	1	SKU-ACQ-009	Ắc quy xe máy	Bình	1500.0000	1500.0000	1131.0000	480000.00	480000.00	10	QTY_DIFF	Số lượng lệch: Hóa đơn (1500.0) vs PO (1500.0) vs Thực nhận (1131.0)
eeef47c1-7db0-4a60-82d3-69cf04e1a172	5bbee748-9a43-43b0-9e92-ba7c074a104d	1	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	Thùng	50.0000	50.0000	50.0000	550000.00	550000.00	10	MATCH	Khớp hoàn toàn
e7caf1bb-bef7-4f7d-aac9-fbdf1ee400dc	bd69db11-ef88-4087-bcc1-8e5d623a59b0	1	SKU-VPP-011	Mực in laser	Hộp	300.0000	300.0000	274.0000	780000.00	780000.00	10	QTY_DIFF	Số lượng lệch: Hóa đơn (300.0) vs PO (300.0) vs Thực nhận (274.0)
d01371f5-937a-44a6-a572-e6931425836e	21c699cf-dafd-49d1-9e4b-2bb6d4c0aac1	1	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	Can	100.0000	100.0000	88.0000	180000.00	180000.00	10	QTY_DIFF	Số lượng lệch: Hóa đơn (100.0) vs PO (100.0) vs Thực nhận (88.0)
381fb828-1623-4f1d-99be-b6e246117b9e	40fe7d0d-32fc-4a5c-b988-456d424f8a4c	1	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	Hộp	100.0000	100.0000	100.0000	65000.00	65000.00	10	MATCH	Khớp hoàn toàn
de0343e8-f912-48ac-9f44-75781d3277ec	9d9f60c5-f253-4390-b22b-1eba3581da8d	1	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	Cái	150.0000	150.0000	122.0000	80000.00	80000.00	10	QTY_DIFF	Số lượng lệch: Hóa đơn (150.0) vs PO (150.0) vs Thực nhận (122.0)
8442a47d-ed9a-415c-abe8-34ed9582e66b	858d20e0-0127-4590-90a8-1e268cd389be	1	SKU-AKD-002	Áo khoác đồng phục (chống nước)	Cái	300.0000	300.0000	276.0000	150000.00	150000.00	10	QTY_DIFF	Số lượng lệch: Hóa đơn (300.0) vs PO (300.0) vs Thực nhận (276.0)
10b1edd8-70cb-4081-bdcf-5f744dd58ff3	2da0cdb0-e4df-4f5c-9108-dd64c7db20b0	1	SKU-QDT-003	Quần đồng phục tài xế	Cái	300.0000	300.0000	283.0000	120000.00	120000.00	10	QTY_DIFF	Số lượng lệch: Hóa đơn (300.0) vs PO (300.0) vs Thực nhận (283.0)
986e75b6-6650-4fe3-a0dd-fa620c85dd78	a41c3b82-6bbe-495c-a666-082853464f9e	1	SKU-GPS-4G	Thiết bị định vị GPS 4G	Bộ	100.0000	100.0000	100.0000	1000000.00	1000000.00	10	MATCH	Khớp hoàn toàn
8095eac9-2ee5-4013-b8a4-deabdf8c0666	41345e6d-fe8e-4f93-8d95-f232c5db2155	1	SKU-CAM-HT	Camera hành trình gắn xe	Bộ	500.0000	500.0000	500.0000	850000.00	850000.00	10	MATCH	Khớp hoàn toàn
2107b45b-f616-4fa1-a019-f879305bcb04	ec067e14-fc64-4618-bc9d-35f0a3b76911	1	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	Cái	100.0000	100.0000	100.0000	2750000.00	2500000.00	10	PRICE_DIFF	Đơn giá lệch: Hóa đơn (2750000.0) vs PO (2500000.0)
6f5f3cee-2f97-40ed-b468-874f53746de4	6dd7ec0d-442c-4d7a-b4f5-c40dc5660678	1	SKU-DCL-003	Decal phản quang dán sườn xe	Tấm	20.0000	20.0000	20.0000	45000.00	45000.00	10	MATCH	Khớp hoàn toàn
4f13d395-eb09-434a-bf44-df4c5102ef54	7a6b10a0-7876-4df1-aa41-27ec126d76aa	1	SKU-BHT-006	Bảng hiệu taplo gắn xe	Cái	1000.0000	1000.0000	1000.0000	35000.00	35000.00	10	MATCH	Khớp hoàn toàn
c5ffaac0-b659-4c97-977c-653df4a398dd	1e123a96-4099-44ca-be0f-1457b2bf58dc	1	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	Hộp	200.0000	200.0000	200.0000	95000.00	95000.00	10	MATCH	Khớp hoàn toàn
9f1b8181-a188-4fdc-a68a-74547f29ebc6	81a299a2-230b-4d55-b1ad-d6adef0b53b6	1	SKU-LOP-008	Lốp xe máy loại thường	Chiếc	1000.0000	1000.0000	1000.0000	320000.00	320000.00	10	MATCH	Khớp hoàn toàn
\.


--
-- Data for Name: password_reset_otps; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.password_reset_otps (id, user_id, otp_hash, reset_token_hash, expires_at, verified_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.permissions (id, code, name, description, created_at) FROM stdin;
8709dadf-6fac-496b-a9dd-46125c868de2	reconciliation.view	Xem đối soát	Xem danh sách và chi tiết hồ sơ đối soát.	2026-08-05 08:30:08.765609+00
da3de37f-8482-4dd6-82b7-8fe144f3adfc	reconciliation.upload	Tải chứng từ	Tải hóa đơn và chứng từ lên hệ thống.	2026-08-05 08:30:08.765609+00
a550558d-f465-4dda-867a-3b423dc64b30	reconciliation.approve	Phê duyệt đối soát	Phê duyệt hoặc từ chối hồ sơ đối soát.	2026-08-05 08:30:08.765609+00
fe30f73d-1094-4f00-b894-b95e21209495	audit.view	Xem nhật ký	Xem nhật ký thao tác trong hệ thống.	2026-08-05 08:30:08.765609+00
fc21052a-0f9f-4c23-bf72-1eab1a6c60c7	settings.manage	Quản lý cấu hình	Cấu hình ngưỡng và quy trình đối soát.	2026-08-05 08:30:08.765609+00
\.


--
-- Data for Name: purchase_order_items; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.purchase_order_items (id, po_id, item_sku, item_name, unit, qty, unit_price) FROM stdin;
82e04f56-eda6-464a-9a94-b3b47fa3f2ed	f0cf0eb5-7915-4f38-ade4-4e01e3418f27	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	50.0000	80000.00
179407d6-cd45-45ca-8cc3-fd557a7d7f55	571b2fd6-7817-4714-98b4-498719295034	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	500.0000	150000.00
e2a8b2f9-ed98-4fd0-a909-8a25027e6973	6ff01987-528c-48cb-9da4-04ce46d1d5b0	SKU-QDT-003	Quần đồng phục tài xế	PCE	300.0000	120000.00
72dd3df6-b72d-4796-b113-85c97ba426d0	0db4633b-20e8-4b7e-8720-f3569077ed7d	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	300.0000	1000000.00
df8b4caa-bb56-4b1c-bbaa-21fa94e2dcea	5550d079-ae1e-4d8a-9789-3b9f4ccf6e64	SKU-CAM-HT	Camera hành trình gắn xe	PCE	1500.0000	850000.00
fcb1f81c-72f7-467e-b5c4-3a3af4554807	da9ee0a7-03dd-4f1d-a13c-8f481a8f00ed	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	500.0000	2500000.00
35d2664c-1600-438a-98e5-682908efe731	d17371a6-456a-48c6-a827-bde47ed19539	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	10.0000	45000.00
0a0a6f45-8dd3-485f-99ca-39ee8f7d2c33	9c8a5b2d-928b-4de2-89bc-098e749f6d47	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	300.0000	35000.00
26d8f1a1-7402-4cf7-9c4e-e2717aa48697	2a41ee65-9928-41c4-b14b-a01fd19680aa	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	1500.0000	95000.00
1865a8bd-60ad-44ed-9c92-c3c65f85ddac	cf0372b3-0428-4e51-a264-1e42a21f4161	SKU-LOP-008	Lốp xe máy loại thường	PCE	20.0000	320000.00
4272853f-81e9-46a6-91ab-7eccadc10747	1b7d0f91-22c3-41a3-acbc-be52edbfdf56	SKU-ACQ-009	Ắc quy xe máy	PCE	300.0000	480000.00
d2f5b64a-a81b-40c2-9b01-9c114c4b44d3	c03d804e-27df-4ddc-bf1e-3146e5c8a5b5	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	30.0000	550000.00
5d5d98f1-1c56-4fd5-a4ba-7b6ab0c3548a	7dd35633-6f69-4e5e-a8f1-f9d0ae7bd8b8	SKU-VPP-011	Mực in laser	PCE	20.0000	780000.00
1aaf86fc-4720-4846-a384-a20a1474a226	8dd199dc-45c7-419b-aea4-9b4f1c7dcd6f	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	100.0000	180000.00
c05e6ee4-f73d-45fc-800c-af8612f4a893	cc66e6d6-3daa-4817-a517-4416b89c17a9	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	100.0000	65000.00
9fb43cd6-aba7-457f-9d33-c30d823311fa	cc07f14d-5821-42cb-935a-7e50c967b378	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	1000.0000	80000.00
64b507c9-928a-4f64-83d9-8e4f230bb5e2	a235dab5-96fb-43ec-b4d0-3cd8ec66cf25	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	100.0000	150000.00
4a34331d-f0a0-4575-a613-0e9ea6157019	8eab6a2f-984b-4313-a75c-0059dcc1cbbd	SKU-QDT-003	Quần đồng phục tài xế	PCE	30.0000	120000.00
f5d0df21-9b35-4c9e-8b38-70bd40f451df	399e49d9-2532-4771-8253-a0c5cf23a5b8	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	500.0000	1000000.00
d8cdf7e3-782d-4e9f-a97c-2ecd6f39e372	d56cafd6-be93-450c-865f-3dc9612bdef9	SKU-CAM-HT	Camera hành trình gắn xe	PCE	30.0000	850000.00
20b4e563-df75-46f0-a1c4-d300644c77be	49031c58-a002-49b0-8d75-e84232e78c6f	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	1500.0000	2500000.00
5d362565-a2f7-445d-b686-3f420ab388bc	e19ed154-17ac-4ae4-8088-da79bcef55b2	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	2000.0000	45000.00
44c8e660-b465-4600-9777-d6231f64196a	bb5d9c3d-26ae-451e-beac-7f1528f13c6d	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	20.0000	35000.00
b6c3f0a1-4fc9-4468-abe5-3541b5bed0a4	b95f4c97-95a4-4e8d-a3c6-5b87fb495222	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	500.0000	95000.00
59dd86ae-26e9-4051-b1db-fb0beae7768f	36aacade-9a77-4afa-bd6a-3accc49d783e	SKU-LOP-008	Lốp xe máy loại thường	PCE	30.0000	320000.00
b1f0bace-b3d6-44f7-b01e-63fa7f556222	8d944c7e-851c-418e-99c8-ce3cb5658a43	SKU-ACQ-009	Ắc quy xe máy	PCE	10.0000	480000.00
5cbc5339-d560-4c65-9307-c3c6e5706f3c	ec1c4fd2-6b12-421f-9e04-faf309c722e8	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	1500.0000	550000.00
d96e27ec-a13d-4fb4-9a63-57e5539452e6	f6b92c01-d0d5-4b87-a858-e7cd8e9155cc	SKU-VPP-011	Mực in laser	PCE	800.0000	780000.00
cde49130-4302-4210-8f30-8fffdd2d7e1b	b9ba33bf-8fed-449b-8285-2ad637250505	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	150.0000	180000.00
3763b026-b07c-47d0-ba40-ebf3898a0278	33967374-bda6-4ff2-b315-33f3e5270d4b	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	300.0000	65000.00
0934235d-426f-4a75-ae0c-2a6c83e14ad3	d804d8d8-722b-481f-8d55-590276081a48	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	150.0000	80000.00
b321fde6-4188-4079-bf96-4343ab279c78	cad80f83-1cdf-4594-a8d2-f324673b7a80	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	20.0000	150000.00
857cb77e-9366-409d-b049-e567ecc268c0	6fd3e4c7-3f14-40e7-b380-4b5d04cda542	SKU-QDT-003	Quần đồng phục tài xế	PCE	150.0000	120000.00
4e5cb1ca-2b69-4440-ac3a-a7b0fe44f05d	7c73b39a-7073-4165-89f1-9d3fe6c4e68e	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	10.0000	1000000.00
83bc8753-2082-4003-88ce-5862d2e93d14	57a29b92-edeb-4931-b839-4fc217a21a62	SKU-CAM-HT	Camera hành trình gắn xe	PCE	50.0000	850000.00
11f3687f-5d92-46df-a62b-dfae04ec6f25	29f8b5b5-2323-4240-91c7-2517d9b60673	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	500.0000	2500000.00
40427c7f-984a-4fe1-90d3-784943a8309e	c50759db-d25b-44da-8bd7-dbd5cd7c04d1	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	10.0000	45000.00
a3fa80bd-d19c-4b95-bc6b-2f5472f33679	622add61-75ce-48c1-9e59-c7cc646f16f6	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	1500.0000	35000.00
4bb2ff07-9edf-4618-b75d-6fb54e54e661	657ba896-76c4-459b-9394-eed65d0581d5	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	20.0000	95000.00
3647c095-bf93-4ba2-b40d-85b5ea4d924f	19efff27-b6ec-4be6-9718-a5829af43141	SKU-LOP-008	Lốp xe máy loại thường	PCE	500.0000	320000.00
e90f3395-a4b7-49cd-b7d3-762ca55d9ccd	368f1823-4cf1-4818-b93f-5bc31a6ddadc	SKU-ACQ-009	Ắc quy xe máy	PCE	30.0000	480000.00
b6411bed-bde4-4e8e-9cfc-0d7556d9edea	2981456a-1bfc-40e5-b2d2-52b27c9455d1	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	300.0000	550000.00
6a6514b1-4ece-4c64-bdfc-f732f9c86246	4d267130-449b-42d6-8fc4-ab9e4a44566d	SKU-VPP-011	Mực in laser	PCE	300.0000	780000.00
c181bcd1-5b2c-4c46-a654-6a149a58a90d	be2e895c-c19d-4df0-902d-54852df51824	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	2000.0000	180000.00
c199fa95-9242-489c-8fe9-9604577a6b35	b131aec2-213c-4140-8fc1-44fb5514991e	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	30.0000	65000.00
76d2ff9f-6394-4d57-9520-baf1b2dd039a	5a94d89c-8b95-416c-b1c2-e0b5713f4ef6	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	2000.0000	80000.00
833f0d4a-2b73-4cc9-bd8e-d75793ad2374	de795147-e7f1-4fa1-9907-a3c70b1727f9	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	1500.0000	150000.00
0d209446-668c-4b19-baec-43b1cbbe7c08	18dd2164-2998-4691-a4ac-33b582eb7fcc	SKU-QDT-003	Quần đồng phục tài xế	PCE	300.0000	120000.00
24d0a93b-afc7-409e-b2b2-8f258ba10b42	82bb671b-8750-4673-a9c0-a6d7e251d43e	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	100.0000	1000000.00
d94091f5-fbae-4d39-b8ba-d406ab3769ce	5803e81c-b2aa-4aec-8441-3745e364dd4a	SKU-CAM-HT	Camera hành trình gắn xe	PCE	30.0000	850000.00
df07ffbb-ebee-4c25-9464-b43320ebab21	4f99d46c-8fcf-4111-814c-a9c0f9410712	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	1500.0000	2500000.00
574c82e6-c410-45f2-9072-3c0530e823f5	311ad533-f91a-4c10-8314-733c27735492	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	50.0000	45000.00
1360e5a4-6bf7-4353-93cc-2ae978985e75	0c3bb7c3-1245-49b5-8813-a27e0cba3531	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	1500.0000	35000.00
47cdead9-f08d-4e29-9186-f38c9c0063a7	47834cc0-b82e-422e-9834-d9a88d146201	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	800.0000	95000.00
9cd25cfb-d192-4ad2-ae69-f93d8d6702b8	8bd637d0-dd0d-489e-86ae-28bb06791cdb	SKU-LOP-008	Lốp xe máy loại thường	PCE	100.0000	320000.00
34b871d8-a17c-40cc-b9a0-f3b3f7b50d40	81671545-4e6c-401e-a7cc-a23c79d5aeb9	SKU-ACQ-009	Ắc quy xe máy	PCE	150.0000	480000.00
01185305-d77a-4708-a680-acf32b60c7c2	7715f692-7eba-4886-a11e-aa6a71bccecc	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	800.0000	550000.00
c8f2f2ae-d038-4135-88c2-4adad78d6910	dcd68ec9-ad92-41bb-8ac2-08c40f55bd0e	SKU-VPP-011	Mực in laser	PCE	300.0000	780000.00
937c23fd-3ae7-4f0d-814a-2f6346d87ce0	cf956a1f-3e12-452d-a467-4f3fac23c4cf	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	200.0000	180000.00
472db7ca-cabb-4de0-838e-454e4e834bad	e7dc0480-68d7-42a1-ac9e-80f143d3cc40	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	300.0000	65000.00
bf721921-b8ea-4a8f-9695-e179d73d998a	80fe92a7-3108-4c8b-9a6f-1cfffc3735ef	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	1000.0000	80000.00
5d4a1372-f473-450c-9fcb-b2e3fee55db4	f29972a7-07c0-4f95-95cf-0d806a55d38b	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	1500.0000	150000.00
2d4530b7-4180-4aa1-9b90-b3d329df133d	7d664956-fbd3-4c47-9331-b83808415a5b	SKU-QDT-003	Quần đồng phục tài xế	PCE	30.0000	120000.00
cb2d58dd-e141-44cd-adf9-f6a2fbb8c5d3	089bc0a7-36b8-4a1a-80df-ce4ba5ce0c43	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	300.0000	1000000.00
88ca24c5-116d-45aa-b9db-d14da9a9b672	86cac3b7-34ca-40ae-ba87-17395ff973c6	SKU-CAM-HT	Camera hành trình gắn xe	PCE	800.0000	850000.00
faca5d0c-53a1-4fad-ba2d-4b8634b4b7a3	0d9c5518-cb0c-4888-847c-6f21c2d5fc62	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	1000.0000	2500000.00
f31cee8b-6028-4721-8031-53cdc65758b2	8a3f8879-0a29-4fe1-856b-f20f6a30f084	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	10.0000	45000.00
d5ab3045-1d18-4f00-ad19-efead4bc5bf2	2f6d9af3-685b-4c0e-8566-9d86723d0698	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	500.0000	35000.00
f941b360-a364-4ef5-91f1-d73f4e7bacbc	c44e813b-4137-4ef3-83d8-217413bbf023	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	500.0000	95000.00
5fc01150-b52e-488a-9aa0-7eb29f96f4da	63661fd9-a412-4c67-80e9-1f09218991ba	SKU-LOP-008	Lốp xe máy loại thường	PCE	300.0000	320000.00
9f5d91b3-c54a-42f8-938f-ae6d481384cf	387001e6-f26f-4d76-949c-38fed3e4e87b	SKU-ACQ-009	Ắc quy xe máy	PCE	200.0000	480000.00
b1d3e5a7-391d-4feb-8302-d5917d20146d	21cc2728-362d-4619-9f18-19bafd3dc14e	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	2000.0000	550000.00
25c1cd88-c7c4-4fff-8f39-33ce80fe60c3	d37008e1-66a9-410a-80dc-dd3a389cb647	SKU-VPP-011	Mực in laser	PCE	20.0000	780000.00
2f09cfc7-0014-4ef6-b4e5-99a1838eb6dc	98eb2a6d-c8c9-4db4-8800-ca616edfa49e	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	100.0000	180000.00
7839caf2-4036-4f51-94a4-e2d66e0cffa7	3f389957-6fe2-4ecc-9900-769194a83148	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	2000.0000	65000.00
b723f965-5b82-4cb8-9add-4bfefa9a3314	a706dedf-376c-426f-9e41-f5850494f908	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	100.0000	80000.00
00d11cb2-8afc-4b19-95a1-87a063ff8621	00666a7e-72e3-4ee6-8c0c-9c65bd7d2a6c	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	100.0000	150000.00
c5062082-6fd3-4238-b46b-8b94e1b56aa0	9275a9be-c0f4-4fd7-9725-1f5d4e0b2e73	SKU-QDT-003	Quần đồng phục tài xế	PCE	800.0000	120000.00
13ecac5e-eee4-4946-9230-5fc7504c7090	963e5493-d879-4d2f-b24c-b559ff85cea2	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	2000.0000	1000000.00
a2d8bc60-3c50-4f52-81e8-c66b73dbfc91	83fe7002-4c21-40cc-91f7-aa9e3214676c	SKU-CAM-HT	Camera hành trình gắn xe	PCE	100.0000	850000.00
6bf5c4d1-885a-40ab-893a-ef2059ddfb32	7b0469d9-5d56-430b-9a39-c9fa8d46863f	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	100.0000	2500000.00
efbe1710-b91c-402a-964a-627a164f0441	58f9b705-7364-41c3-bca2-01b3f7de74b4	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	2000.0000	45000.00
bb5684b8-dfe7-40b4-b563-1632a54338bd	7c4d9566-5623-4ee8-b1b2-819096fa5173	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	800.0000	35000.00
5821c4ba-ac00-49d2-a784-52860d6f5543	da60e630-3714-46c7-9988-5561c5cfd3cd	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	50.0000	95000.00
a099538b-5d81-4587-9c11-0377c4e1e319	1db0a0f7-b135-47b6-b3ed-624d9cdd8e8c	SKU-LOP-008	Lốp xe máy loại thường	PCE	20.0000	320000.00
71a358a2-c756-4a74-b837-85c969118729	1f171116-45c4-4b6e-812d-be9514663694	SKU-ACQ-009	Ắc quy xe máy	PCE	1500.0000	480000.00
b9808ae0-ebe8-4392-af5b-340a57c4cfae	afbe6587-b38f-4fe9-aa3f-3798bb81a766	SKU-VPP-010	Giấy in A4 (thùng 5 ram)	PCE	50.0000	550000.00
5abf8fb6-5d4b-4528-93ef-012b405179b2	3ee8234f-ea12-40a9-87ad-638c24ae5c58	SKU-VPP-011	Mực in laser	PCE	300.0000	780000.00
7a910015-754c-4d5b-b233-0a023120aef7	47859410-6401-49f9-a53e-55da2d566c06	SKU-VSC-012	Nước rửa xe chuyên dụng (can 5L)	PCE	100.0000	180000.00
07cef8b7-fce2-4973-8172-9170537c4d87	30d56ee7-ddff-4f51-831e-2742ca9e48dc	SKU-BHL-013	Găng tay bảo hộ lao động (hộp 100 chiếc)	PCE	100.0000	65000.00
bf9374a9-98be-48ce-af42-c92f39491acb	67b9881f-2af6-40af-85e1-9dce6fad251d	SKU-MBH-001	Mũ bảo hiểm tiêu chuẩn (có kính)	PCE	150.0000	80000.00
f2825f2b-3751-460a-afe6-0aca634c9ccd	22d06610-9e7e-448a-9f7a-ef71852aa31a	SKU-AKD-002	Áo khoác đồng phục (chống nước)	PCE	300.0000	150000.00
a5754d8a-ad89-465f-952c-8be170c290a0	75defece-93e3-4b58-b49d-12c533ef48b6	SKU-QDT-003	Quần đồng phục tài xế	PCE	300.0000	120000.00
da43a0e5-32b4-419c-be34-e51e44da5bef	5b1cf8b2-59e3-4ebb-8d02-50118de5a04b	SKU-GPS-4G	Thiết bị định vị GPS 4G	PCE	100.0000	1000000.00
13175cfb-ec62-4845-9af5-238e659dc3ba	9e5bf82c-2e8b-452f-a82e-0086cb061901	SKU-CAM-HT	Camera hành trình gắn xe	PCE	500.0000	850000.00
77c9c83a-eb0c-4dd4-864f-f6b8b1ba596a	a05ad587-ec30-4dbc-819a-0005b53f9ec2	SKU-DTD-005	Điện thoại chuyên dụng cho tài xế	PCE	100.0000	2500000.00
bbe57b71-a52a-446e-a81f-509532f32c5b	592c0552-9511-4ca4-b568-69faf5212827	SKU-DCL-003	Decal phản quang dán sườn xe	PCE	20.0000	45000.00
308fac24-276c-475d-8200-f5cc92a6d1f8	93b8b89d-ae77-4c36-9f52-8111cf730949	SKU-BHT-006	Bảng hiệu taplo gắn xe	PCE	1000.0000	35000.00
6508c2c8-0f06-4443-88fa-874ae498ff7c	a6a059ac-32e0-4e7f-9fe9-88202ebe8c16	SKU-DNH-007	Dầu nhớt động cơ (hộp 1L)	PCE	200.0000	95000.00
4698983d-6d2f-4892-a75d-f9f1deb57f3e	99a0de02-f87a-485f-81a0-63926160ce7d	SKU-LOP-008	Lốp xe máy loại thường	PCE	1000.0000	320000.00
\.


--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.purchase_orders (id, po_number, supplier_name, supplier_tax_id, buyer_name, total_amount, created_at, updated_at) FROM stdin;
f0cf0eb5-7915-4f38-ade4-4e01e3418f27	PO-2026-000001	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	4400000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
571b2fd6-7817-4714-98b4-498719295034	PO-2026-000002	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	82500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
6ff01987-528c-48cb-9da4-04ce46d1d5b0	PO-2026-000003	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	39600000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
0db4633b-20e8-4b7e-8720-f3569077ed7d	PO-2026-000004	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	330000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
5550d079-ae1e-4d8a-9789-3b9f4ccf6e64	PO-2026-000005	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	1402500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
da9ee0a7-03dd-4f1d-a13c-8f481a8f00ed	PO-2026-000006	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	1375000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
d17371a6-456a-48c6-a827-bde47ed19539	PO-2026-000007	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	495000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
9c8a5b2d-928b-4de2-89bc-098e749f6d47	PO-2026-000008	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	11550000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
2a41ee65-9928-41c4-b14b-a01fd19680aa	PO-2026-000009	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	156750000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
cf0372b3-0428-4e51-a264-1e42a21f4161	PO-2026-000010	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	7040000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
1b7d0f91-22c3-41a3-acbc-be52edbfdf56	PO-2026-000011	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	158400000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
c03d804e-27df-4ddc-bf1e-3146e5c8a5b5	PO-2026-000012	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	18150000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
7dd35633-6f69-4e5e-a8f1-f9d0ae7bd8b8	PO-2026-000013	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	17160000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
8dd199dc-45c7-419b-aea4-9b4f1c7dcd6f	PO-2026-000014	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	19800000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
cc66e6d6-3daa-4817-a517-4416b89c17a9	PO-2026-000015	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	7150000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
cc07f14d-5821-42cb-935a-7e50c967b378	PO-2026-000016	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	88000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
a235dab5-96fb-43ec-b4d0-3cd8ec66cf25	PO-2026-000017	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	16500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
8eab6a2f-984b-4313-a75c-0059dcc1cbbd	PO-2026-000018	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	3960000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
399e49d9-2532-4771-8253-a0c5cf23a5b8	PO-2026-000019	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	550000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
d56cafd6-be93-450c-865f-3dc9612bdef9	PO-2026-000020	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	28050000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
49031c58-a002-49b0-8d75-e84232e78c6f	PO-2026-000021	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	4125000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
e19ed154-17ac-4ae4-8088-da79bcef55b2	PO-2026-000022	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	99000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
bb5d9c3d-26ae-451e-beac-7f1528f13c6d	PO-2026-000023	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	770000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
b95f4c97-95a4-4e8d-a3c6-5b87fb495222	PO-2026-000024	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	52250000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
36aacade-9a77-4afa-bd6a-3accc49d783e	PO-2026-000025	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	10560000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
8d944c7e-851c-418e-99c8-ce3cb5658a43	PO-2026-000026	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	5280000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
ec1c4fd2-6b12-421f-9e04-faf309c722e8	PO-2026-000027	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	907500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
f6b92c01-d0d5-4b87-a858-e7cd8e9155cc	PO-2026-000028	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	686400000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
b9ba33bf-8fed-449b-8285-2ad637250505	PO-2026-000029	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	29700000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
33967374-bda6-4ff2-b315-33f3e5270d4b	PO-2026-000030	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	21450000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
d804d8d8-722b-481f-8d55-590276081a48	PO-2026-000031	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	13200000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
cad80f83-1cdf-4594-a8d2-f324673b7a80	PO-2026-000032	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	3300000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
6fd3e4c7-3f14-40e7-b380-4b5d04cda542	PO-2026-000033	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	19800000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
7c73b39a-7073-4165-89f1-9d3fe6c4e68e	PO-2026-000034	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	11000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
57a29b92-edeb-4931-b839-4fc217a21a62	PO-2026-000035	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	46750000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
29f8b5b5-2323-4240-91c7-2517d9b60673	PO-2026-000036	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	1375000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
c50759db-d25b-44da-8bd7-dbd5cd7c04d1	PO-2026-000037	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	495000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
622add61-75ce-48c1-9e59-c7cc646f16f6	PO-2026-000038	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	57750000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
657ba896-76c4-459b-9394-eed65d0581d5	PO-2026-000039	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	2090000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
19efff27-b6ec-4be6-9718-a5829af43141	PO-2026-000040	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	176000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
368f1823-4cf1-4818-b93f-5bc31a6ddadc	PO-2026-000041	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	15840000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
2981456a-1bfc-40e5-b2d2-52b27c9455d1	PO-2026-000042	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	181500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
4d267130-449b-42d6-8fc4-ab9e4a44566d	PO-2026-000043	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	257400000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
be2e895c-c19d-4df0-902d-54852df51824	PO-2026-000044	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	396000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
b131aec2-213c-4140-8fc1-44fb5514991e	PO-2026-000045	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	2145000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
5a94d89c-8b95-416c-b1c2-e0b5713f4ef6	PO-2026-000046	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	176000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
de795147-e7f1-4fa1-9907-a3c70b1727f9	PO-2026-000047	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	247500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
18dd2164-2998-4691-a4ac-33b582eb7fcc	PO-2026-000048	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	39600000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
82bb671b-8750-4673-a9c0-a6d7e251d43e	PO-2026-000049	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	110000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
5803e81c-b2aa-4aec-8441-3745e364dd4a	PO-2026-000050	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	28050000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
4f99d46c-8fcf-4111-814c-a9c0f9410712	PO-2026-000051	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	4125000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
311ad533-f91a-4c10-8314-733c27735492	PO-2026-000052	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	2475000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
0c3bb7c3-1245-49b5-8813-a27e0cba3531	PO-2026-000053	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	57750000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
47834cc0-b82e-422e-9834-d9a88d146201	PO-2026-000054	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	83600000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
8bd637d0-dd0d-489e-86ae-28bb06791cdb	PO-2026-000055	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	35200000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
81671545-4e6c-401e-a7cc-a23c79d5aeb9	PO-2026-000056	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	79200000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
7715f692-7eba-4886-a11e-aa6a71bccecc	PO-2026-000057	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	484000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
dcd68ec9-ad92-41bb-8ac2-08c40f55bd0e	PO-2026-000058	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	257400000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
cf956a1f-3e12-452d-a467-4f3fac23c4cf	PO-2026-000059	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	39600000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
e7dc0480-68d7-42a1-ac9e-80f143d3cc40	PO-2026-000060	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	21450000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
80fe92a7-3108-4c8b-9a6f-1cfffc3735ef	PO-2026-000061	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	88000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
f29972a7-07c0-4f95-95cf-0d806a55d38b	PO-2026-000062	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	247500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
7d664956-fbd3-4c47-9331-b83808415a5b	PO-2026-000063	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	3960000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
089bc0a7-36b8-4a1a-80df-ce4ba5ce0c43	PO-2026-000064	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	330000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
86cac3b7-34ca-40ae-ba87-17395ff973c6	PO-2026-000065	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	748000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
0d9c5518-cb0c-4888-847c-6f21c2d5fc62	PO-2026-000066	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	2750000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
8a3f8879-0a29-4fe1-856b-f20f6a30f084	PO-2026-000067	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	495000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
2f6d9af3-685b-4c0e-8566-9d86723d0698	PO-2026-000068	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	19250000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
c44e813b-4137-4ef3-83d8-217413bbf023	PO-2026-000069	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	52250000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
63661fd9-a412-4c67-80e9-1f09218991ba	PO-2026-000070	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	105600000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
387001e6-f26f-4d76-949c-38fed3e4e87b	PO-2026-000071	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	105600000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
21cc2728-362d-4619-9f18-19bafd3dc14e	PO-2026-000072	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	1210000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
d37008e1-66a9-410a-80dc-dd3a389cb647	PO-2026-000073	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	17160000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
98eb2a6d-c8c9-4db4-8800-ca616edfa49e	PO-2026-000074	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	19800000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
3f389957-6fe2-4ecc-9900-769194a83148	PO-2026-000075	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	143000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
a706dedf-376c-426f-9e41-f5850494f908	PO-2026-000076	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	8800000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
00666a7e-72e3-4ee6-8c0c-9c65bd7d2a6c	PO-2026-000077	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	16500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
9275a9be-c0f4-4fd7-9725-1f5d4e0b2e73	PO-2026-000078	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	105600000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
963e5493-d879-4d2f-b24c-b559ff85cea2	PO-2026-000079	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	2200000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
83fe7002-4c21-40cc-91f7-aa9e3214676c	PO-2026-000080	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	93500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
7b0469d9-5d56-430b-9a39-c9fa8d46863f	PO-2026-000081	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	275000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
58f9b705-7364-41c3-bca2-01b3f7de74b4	PO-2026-000082	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	99000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
7c4d9566-5623-4ee8-b1b2-819096fa5173	PO-2026-000083	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	30800000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
da60e630-3714-46c7-9988-5561c5cfd3cd	PO-2026-000084	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	5225000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
1db0a0f7-b135-47b6-b3ed-624d9cdd8e8c	PO-2026-000085	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	7040000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
1f171116-45c4-4b6e-812d-be9514663694	PO-2026-000086	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	792000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
afbe6587-b38f-4fe9-aa3f-3798bb81a766	PO-2026-000087	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	30250000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
3ee8234f-ea12-40a9-87ad-638c24ae5c58	PO-2026-000088	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	257400000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
47859410-6401-49f9-a53e-55da2d566c06	PO-2026-000089	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	19800000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
30d56ee7-ddff-4f51-831e-2742ca9e48dc	PO-2026-000090	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	7150000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
67b9881f-2af6-40af-85e1-9dce6fad251d	PO-2026-000091	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	13200000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
22d06610-9e7e-448a-9f7a-ef71852aa31a	PO-2026-000092	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	49500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
75defece-93e3-4b58-b49d-12c533ef48b6	PO-2026-000093	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	39600000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
5b1cf8b2-59e3-4ebb-8d02-50118de5a04b	PO-2026-000094	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	110000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
9e5bf82c-2e8b-452f-a82e-0086cb061901	PO-2026-000095	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	467500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
a05ad587-ec30-4dbc-819a-0005b53f9ec2	PO-2026-000096	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	275000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
592c0552-9511-4ca4-b568-69faf5212827	PO-2026-000097	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	990000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
93b8b89d-ae77-4c36-9f52-8111cf730949	PO-2026-000098	NHÀ IN QUẢNG CÁO VIỆT	0314567890	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	38500000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
a6a059ac-32e0-4e7f-9fe9-88202ebe8c16	PO-2026-000099	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	20900000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
99a0de02-f87a-485f-81a0-63926160ce7d	PO-2026-000100	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	CÔNG TY CỔ PHẦN CÔNG NGHỆ DI CHUYỂN VIETGO	352000000.00	2026-08-07 09:58:47.747113+00	2026-08-07 09:58:47.747113+00
\.


--
-- Data for Name: reconciliation_cases; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.reconciliation_cases (id, case_number, invoice_number, po_number, grn_number, partner_name, partner_tax_id, case_date, total_amount, status, risk_level, confidence, ai_note, ai_summary, ai_recommendation, diff_amount, diff_type, processed_by_id, processed_at, decision, rejection_note, created_at, updated_at) FROM stdin;
ac574ef9-1169-4566-b3e3-9ba0895a75d5	DOC-0012	0000012	PO-2026-000012	GRN-2026-000012	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	19965000.00	major_diff	high	0.8500	Chênh lệch số tiền: 1,815,000.0 VND (10.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Đơn giá lệch: Hóa đơn (605000.0) vs PO (550000.0)	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	1815000.00	MISMATCH_PRICE	e4faca71-c430-4e17-a857-b38eda5014db	2026-08-07 10:00:14.769516+00	rejected	ss	2026-08-07 09:58:48.062994+00	2026-08-07 10:00:14.764212+00
f2fa5494-da04-4bab-860b-00355c612905	DOC-0001	0000001	PO-2026-000001	GRN-2026-000001	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	4400000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
7c865d7a-1984-48ad-a9e5-c888bc24df70	DOC-0002	0000002	PO-2026-000002	GRN-2026-000002	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	82500000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
daaa6cc4-6712-47d7-bf77-8c3bdce60bd7	DOC-0003	0000003	PO-2026-000003	GRN-2026-000003	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	39600000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 0.0 VND (0.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Số lượng lệch: Hóa đơn (300.0) vs PO (300.0) vs Thực nhận (215.0)	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	0.00	MISMATCH_QTY	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
0202bc06-6890-4f38-9a98-d3ff61fd446b	DOC-0004	0000004	PO-2026-000004	GRN-2026-000004	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	330000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
f511b76b-8f11-462d-ae98-ff436b72232d	DOC-0006	0000006	PO-2026-000006	GRN-2026-000006	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	1375000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
f2af4278-8812-44da-884f-c5fa14e55488	DOC-0007	0000007	PO-2026-000007	GRN-2026-000007	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	486224.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 8,776.0 VND (1.77%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: 	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	8776.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
190449b5-a965-49b5-87cc-b01f31bd7964	DOC-0008	0000008	PO-2026-000008	GRN-2026-000008	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	11550000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
4d23ef29-450f-42e3-b443-a2bca31a7eb7	DOC-0009	0000009	PO-2026-000009	GRN-2026-000009	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	156750000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
e5a788da-13cf-4c34-ad44-31b7ff7beffd	DOC-0010	0000010	PO-2026-000010	GRN-2026-000010	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	7040000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
6c830aea-a95e-4d5f-9e17-9b54ce003654	DOC-0011	0000011	PO-2026-000011	GRN-2026-000011	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	155520000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 2,880,000.0 VND (1.82%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: 	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	2880000.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
39f26f13-d452-4868-8428-4ac9d263f208	DOC-0013	0000013	PO-2026-000013	GRN-2026-000013	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	17160000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
c5ce9c69-4b73-4156-b68f-337c010b557c	DOC-0014	0000014	PO-2026-000014	GRN-2026-000014	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	19800000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
9c5139f4-b450-46ce-b174-82e4790d7d4c	DOC-0015	0000015	PO-2026-000015	GRN-2026-000015	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	7001815.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 148,185.0 VND (2.07%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: 	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	148185.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
6d8f8904-1d14-4115-a589-17728638ce2a	DOC-0016	0000016	PO-2026-000016	GRN-2026-000016	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	88000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
6f5cf06b-bde3-43a1-a407-c7e9be7f0ec4	DOC-0017	0000017	PO-2026-000017	GRN-2026-000017	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	16500000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
9d86ece0-4233-4e8e-b921-9ea8d6b8f3ba	DOC-0018	0000018	PO-2026-000018	GRN-2026-000018	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	3888000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 72,000.0 VND (1.82%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: 	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	72000.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
139a2769-9d7f-4688-8eff-6de43b073a1c	DOC-0005	0000005	PO-2026-000005	GRN-2026-000005	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	1402500000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	e4faca71-c430-4e17-a857-b38eda5014db	2026-08-07 09:59:29.450825+00	rejected	s	2026-08-07 09:58:48.062994+00	2026-08-07 09:59:29.444036+00
604181b8-e356-4e34-9314-ae8470062d1b	DOC-0019	0000019	PO-2026-000019	GRN-2026-000019	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	538566975.00	major_diff	high	0.8500	Chênh lệch số tiền: 11,433,025.0 VND (2.08%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: 	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	11433025.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
b1aac817-dd9f-4a3e-acdf-28522e83ff4c	DOC-0020	0000020	PO-2026-000020	GRN-2026-000020	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	28050000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
ce937e79-6cb5-49c7-af0a-3b5e2cf511bf	DOC-0021	0000021	PO-2026-000021	GRN-2026-000021	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	4125000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
ccfe4b58-3415-4eb3-8503-b7ab31bf498f	DOC-0022	0000022	PO-2026-000022	GRN-2026-000022	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	99000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
12d09fc1-f035-4df0-8053-1f5509db6c69	DOC-0023	0000023	PO-2026-000023	GRN-2026-000023	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	756000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 14,000.0 VND (1.82%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: 	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	14000.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
6e0b1d8c-055c-4dba-836f-5443fdc91e34	DOC-0024	0000024	PO-2026-000024	GRN-2026-000024	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	52250000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
2639fd70-670d-440a-adcd-5ce56bea1a01	DOC-0025	0000025	PO-2026-000025	GRN-2026-000025	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	10560000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
0825fcfc-950b-495e-bbcd-209ed7b1a613	DOC-0026	0000026	PO-2026-000026	GRN-2026-000026	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	5280000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
2cf0288e-a1c2-440a-9328-d82d85fee944	DOC-0027	0000027	PO-2026-000027	GRN-2026-000027	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	907500000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
06342582-625e-4ee7-aab2-17ea14b73fb4	DOC-0028	0000028	PO-2026-000028	GRN-2026-000028	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	673920000.00	major_diff	high	0.8500	Chênh lệch số tiền: 12,480,000.0 VND (1.82%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: 	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	12480000.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
0bc9e304-fb9b-4eef-b711-bf4fd1b7617a	DOC-0029	0000029	PO-2026-000029	GRN-2026-000029	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	29700000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
8c7b0272-a67a-4f5c-b131-380f9bf0e6df	DOC-0030	0000030	PO-2026-000030	GRN-2026-000030	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	21450000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
bf99c499-827c-4c08-8214-e8d822ab08bc	DOC-0031	0000031	PO-2026-000031	GRN-2026-000031	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	13200000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
20fb5d17-ba8c-4f07-970e-2ca1ad6e4779	DOC-0032	0000032	PO-2026-000032	GRN-2026-000032	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	3630000.00	major_diff	high	0.8500	Chênh lệch số tiền: 330,000.0 VND (10.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Đơn giá lệch: Hóa đơn (165000.0) vs PO (150000.0)	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	330000.00	MISMATCH_PRICE	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
74d9f840-95e6-4a53-8845-08bf67fea424	DOC-0033	0000033	PO-2026-000033	GRN-2026-000033	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	19800000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 0.0 VND (0.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Số lượng lệch: Hóa đơn (150.0) vs PO (150.0) vs Thực nhận (112.0)	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	0.00	MISMATCH_QTY	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
829d2ae8-290e-4fa4-bcff-5d898703ea80	DOC-0034	0000034	PO-2026-000034	GRN-2026-000034	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	11000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
87bbcf1a-e95e-43df-aa3d-7f2446348540	DOC-0035	0000035	PO-2026-000035	GRN-2026-000035	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	46750000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
c07477c3-801a-4dcf-b576-bd4362bde0fd	DOC-0036	0000036	PO-2026-000036	GRN-2026-000036	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	1348026436.00	major_diff	high	0.8500	Chênh lệch số tiền: 26,973,564.0 VND (1.96%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: 	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	26973564.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
b7b33dfc-8506-4674-bac5-15c721e8041b	DOC-0037	0000037	PO-2026-000037	GRN-2026-000037	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	544500.00	major_diff	high	0.8500	Chênh lệch số tiền: 49,500.0 VND (10.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Đơn giá lệch: Hóa đơn (49500.0) vs PO (45000.0)	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	49500.00	MISMATCH_PRICE	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
45a88782-2981-49ae-bcf1-063ee969fc87	DOC-0038	0000038	PO-2026-000038	GRN-2026-000038	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	63525000.00	major_diff	high	0.8500	Chênh lệch số tiền: 5,775,000.0 VND (10.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Đơn giá lệch: Hóa đơn (38500.0) vs PO (35000.0)	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	5775000.00	MISMATCH_PRICE	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
599e3b98-87c2-4c56-94f1-bcb85db8c37a	DOC-0039	0000039	PO-2026-000039	GRN-2026-000039	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	2090000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
5901ba4e-dd03-4b5c-9afc-d9595b329a34	DOC-0040	0000040	PO-2026-000040	GRN-2026-000040	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	176000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
5e9b092b-f86e-4eee-b8a2-178ad1f8205c	DOC-0041	0000041	PO-2026-000041	GRN-2026-000041	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	15840000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
5c63410c-8b60-4733-b38b-b4b6c7561d60	DOC-0042	0000042	PO-2026-000042	GRN-2026-000042	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	181500000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 0.0 VND (0.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Số lượng lệch: Hóa đơn (300.0) vs PO (300.0) vs Thực nhận (229.0)	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	0.00	MISMATCH_QTY	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
e66dc961-ab79-43f2-a73a-134596516f99	DOC-0043	0000043	PO-2026-000043	GRN-2026-000043	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	257400000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
ae4f05a7-a754-4df2-87fe-6608bedf0cfd	DOC-0044	0000044	PO-2026-000044	GRN-2026-000044	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	396000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
c01af754-389c-4941-ae29-97e39d458120	DOC-0045	0000045	PO-2026-000045	GRN-2026-000045	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	2145000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
0a205823-165a-40cb-bbe6-00219455313f	DOC-0046	0000046	PO-2026-000046	GRN-2026-000046	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	176000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
4e3cf4e8-4f67-4999-98c2-657b26a6d2a2	DOC-0047	0000047	PO-2026-000047	GRN-2026-000047	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	247500000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
82488810-fd3f-4fe4-869f-44d61f681a73	DOC-0048	0000048	PO-2026-000048	GRN-2026-000048	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	39600000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
acebc132-b8f1-4a9d-a8ff-bbe7390b7ff1	DOC-0049	0000049	PO-2026-000049	GRN-2026-000049	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	110000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
7e3afc41-d106-4943-b4a1-2450e4a394d6	DOC-0050	0000050	PO-2026-000050	GRN-2026-000050	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	30855000.00	major_diff	high	0.8500	Chênh lệch số tiền: 2,805,000.0 VND (10.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Đơn giá lệch: Hóa đơn (935000.0) vs PO (850000.0)	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	2805000.00	MISMATCH_PRICE	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
90ee1430-00ab-49aa-a103-2db93ecd8826	DOC-0051	0000051	PO-2026-000051	GRN-2026-000051	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	4537500000.00	major_diff	high	0.8500	Chênh lệch số tiền: 412,500,000.0 VND (10.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Đơn giá lệch: Hóa đơn (2750000.0) vs PO (2500000.0)	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	412500000.00	MISMATCH_PRICE	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
86b7572c-8e47-4abe-8c54-1bc4a18bf2b6	DOC-0052	0000052	PO-2026-000052	GRN-2026-000052	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	2475000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
61a716a6-635b-49c5-b2d8-f1667049f72a	DOC-0053	0000053	PO-2026-000053	GRN-2026-000053	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	63525000.00	major_diff	high	0.8500	Chênh lệch số tiền: 5,775,000.0 VND (10.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Đơn giá lệch: Hóa đơn (38500.0) vs PO (35000.0)	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	5775000.00	MISMATCH_PRICE	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
5bd4dcf3-7b50-49ed-849a-cfb7e41a0145	DOC-0054	0000054	PO-2026-000054	GRN-2026-000054	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	83600000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
384264ca-20ee-4713-abf6-ec201250de04	DOC-0055	0000055	PO-2026-000055	GRN-2026-000055	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	35200000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
580659a9-d184-4a2b-b39b-381c034db28b	DOC-0056	0000056	PO-2026-000056	GRN-2026-000056	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	79200000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
ed95c3bc-d805-46e1-bc1c-be3fae379359	DOC-0057	0000057	PO-2026-000057	GRN-2026-000057	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	532400000.00	major_diff	high	0.8500	Chênh lệch số tiền: 48,400,000.0 VND (10.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Đơn giá lệch: Hóa đơn (605000.0) vs PO (550000.0)	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	48400000.00	MISMATCH_PRICE	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
ab979125-c07d-463c-b0ce-6669b660eba1	DOC-0058	0000058	PO-2026-000058	GRN-2026-000058	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	257400000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
f77bf0e2-bf4b-4896-a758-d2aa90cd739f	DOC-0059	0000059	PO-2026-000059	GRN-2026-000059	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	39600000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
fbb46446-77f8-4a89-a796-fd3b8e0d21be	DOC-0060	0000060	PO-2026-000060	GRN-2026-000060	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	21450000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
b31cb584-16f1-4a9b-8ee1-85c6f48a9e95	DOC-0061	0000061	PO-2026-000061	GRN-2026-000061	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	88000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
7632103a-25c3-4620-97a1-0143a0d24b53	DOC-0062	0000062	PO-2026-000062	GRN-2026-000062	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	247500000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
17209e00-13f6-4aa6-a877-ebeddddcff23	DOC-0063	0000063	PO-2026-000063	GRN-2026-000063	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	3960000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
975e6cd9-8b2b-4ce9-93c8-f178ca2bc7df	DOC-0064	0000064	PO-2026-000064	GRN-2026-000064	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	330000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
923677ed-a11b-44c3-9fd2-613dd62b2dec	DOC-0065	0000065	PO-2026-000065	GRN-2026-000065	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	748000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
926f21e5-0602-43f8-a683-da31b11fb7cb	DOC-0066	0000066	PO-2026-000066	GRN-2026-000066	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	2750000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
8f9646ef-fdd1-48c6-a6e1-8c80b647cd8d	DOC-0067	0000067	PO-2026-000067	GRN-2026-000067	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	487485.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 7,515.0 VND (1.52%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: 	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	7515.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
4501f76a-afbf-4db2-814c-890c03ebb12d	DOC-0068	0000068	PO-2026-000068	GRN-2026-000068	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	19250000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
3f9f6dd2-7a32-4a85-9b45-e35a1ae379fe	DOC-0069	0000069	PO-2026-000069	GRN-2026-000069	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	52250000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
2db905e7-0e69-4776-9471-8d77c47ac3fe	DOC-0070	0000070	PO-2026-000070	GRN-2026-000070	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	105600000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
9d2cae70-da3c-4255-a70b-2b71267c00d5	DOC-0071	0000071	PO-2026-000071	GRN-2026-000071	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	105600000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
02e36fe5-bcbd-421b-ba41-f6882b35fde3	DOC-0072	0000072	PO-2026-000072	GRN-2026-000072	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	1210000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
708b1d7c-8b55-4081-bb49-0194ed0b87d5	DOC-0073	0000073	PO-2026-000073	GRN-2026-000073	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	17160000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
fe45e2de-a819-4dda-a63d-cbb9674201f0	DOC-0074	0000074	PO-2026-000074	GRN-2026-000074	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	19510384.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 289,616.0 VND (1.46%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: 	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	289616.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
def41e1e-d370-41fc-95fb-5d818a7332ce	DOC-0075	0000075	PO-2026-000075	GRN-2026-000075	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	157300000.00	major_diff	high	0.8500	Chênh lệch số tiền: 14,300,000.0 VND (10.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Đơn giá lệch: Hóa đơn (71500.0) vs PO (65000.0)	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	14300000.00	MISMATCH_PRICE	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
93b25c35-b8f0-4021-b39a-4a543a2dbbe4	DOC-0076	0000076	PO-2026-000076	GRN-2026-000076	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	8800000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
c2a91e09-c919-4d02-8d6f-8d7c11a79db3	DOC-0077	0000077	PO-2026-000077	GRN-2026-000077	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	16500000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
e8550b5c-f86c-40d2-b1be-7da606f24253	DOC-0078	0000078	PO-2026-000078	GRN-2026-000078	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	105600000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
214cc9ba-ab32-4eeb-ae53-0e7d0a24e685	DOC-0079	0000079	PO-2026-000079	GRN-2026-000079	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	2200000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
83a2cc69-bde7-4fec-bcb2-97d700f7ffb5	DOC-0080	0000080	PO-2026-000080	GRN-2026-000080	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	93500000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
95d79de4-f5c4-4b27-9414-ab867ec1a952	DOC-0081	0000081	PO-2026-000081	GRN-2026-000081	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	275000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
bcf7bfe8-f01b-449e-a9c6-2dc31ee02fd7	DOC-0082	0000082	PO-2026-000082	GRN-2026-000082	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	99000000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 0.0 VND (0.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Số lượng lệch: Hóa đơn (2000.0) vs PO (2000.0) vs Thực nhận (1439.0)	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	0.00	MISMATCH_QTY	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
0370f3b3-5e03-43b3-ad8b-95c190cc7278	DOC-0083	0000083	PO-2026-000083	GRN-2026-000083	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	30800000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
b3855e98-bf43-434b-a120-8a14543924ab	DOC-0084	0000084	PO-2026-000084	GRN-2026-000084	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	5225000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
9945be40-558c-4a31-8801-f30c448322a2	DOC-0085	0000085	PO-2026-000085	GRN-2026-000085	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	7040000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
da3004fa-b159-4061-9497-cb4f7437131f	DOC-0086	0000086	PO-2026-000086	GRN-2026-000086	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	792000000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 0.0 VND (0.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Số lượng lệch: Hóa đơn (1500.0) vs PO (1500.0) vs Thực nhận (1131.0)	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	0.00	MISMATCH_QTY	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
5bbee748-9a43-43b0-9e92-ba7c074a104d	DOC-0087	0000087	PO-2026-000087	GRN-2026-000087	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	30250000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
bd69db11-ef88-4087-bcc1-8e5d623a59b0	DOC-0088	0000088	PO-2026-000088	GRN-2026-000088	CÔNG TY CỔ PHẦN VĂN PHÒNG PHẨM THÀNH ĐẠT	0311122334	2026-08-07	257400000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 0.0 VND (0.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Số lượng lệch: Hóa đơn (300.0) vs PO (300.0) vs Thực nhận (274.0)	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	0.00	MISMATCH_QTY	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
21c699cf-dafd-49d1-9e4b-2bb6d4c0aac1	DOC-0089	0000089	PO-2026-000089	GRN-2026-000089	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	19800000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 0.0 VND (0.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Số lượng lệch: Hóa đơn (100.0) vs PO (100.0) vs Thực nhận (88.0)	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	0.00	MISMATCH_QTY	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
40fe7d0d-32fc-4a5c-b988-456d424f8a4c	DOC-0090	0000090	PO-2026-000090	GRN-2026-000090	CÔNG TY TNHH THIẾT BỊ VỆ SINH CÔNG NGHIỆP SẠCH VIỆT	0322334455	2026-08-07	7150000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
9d9f60c5-f253-4390-b22b-1eba3581da8d	DOC-0091	0000091	PO-2026-000091	GRN-2026-000091	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	13200000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 0.0 VND (0.00%). Ngưỡng cho phép: 1.00% hoặc 2,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Số lượng lệch: Hóa đơn (150.0) vs PO (150.0) vs Thực nhận (122.0)	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	0.00	MISMATCH_QTY	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
858d20e0-0127-4590-90a8-1e268cd389be	DOC-0092	0000092	PO-2026-000092	GRN-2026-000092	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	49500000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 0.0 VND (0.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Số lượng lệch: Hóa đơn (300.0) vs PO (300.0) vs Thực nhận (276.0)	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	0.00	MISMATCH_QTY	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
2da0cdb0-e4df-4f5c-9108-dd64c7db20b0	DOC-0093	0000093	PO-2026-000093	GRN-2026-000093	CÔNG TY TNHH MAY MẶC ĐỒNG PHỤC AN PHÁT	0101234567	2026-08-07	39600000.00	minor_diff	medium	0.8500	Chênh lệch số tiền: 0.0 VND (0.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Số lượng lệch: Hóa đơn (300.0) vs PO (300.0) vs Thực nhận (283.0)	Chênh lệch nhỏ nằm trong ngưỡng cho phép, đề xuất phê duyệt.	0.00	MISMATCH_QTY	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
a41c3b82-6bbe-495c-a666-082853464f9e	DOC-0094	0000094	PO-2026-000094	GRN-2026-000094	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	110000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
41345e6d-fe8e-4f93-8d95-f232c5db2155	DOC-0095	0000095	PO-2026-000095	GRN-2026-000095	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	467500000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
ec067e14-fc64-4618-bc9d-35f0a3b76911	DOC-0096	0000096	PO-2026-000096	GRN-2026-000096	CÔNG TY CỔ PHẦN THIẾT BỊ ĐIỆN TỬ VIỄN THÔNG TOÀN CẦU	0309876543	2026-08-07	302500000.00	major_diff	high	0.8500	Chênh lệch số tiền: 27,500,000.0 VND (10.00%). Ngưỡng cho phép: 3.00% hoặc 5,000,000.00 VND.	Phát hiện chênh lệch giữa các chứng từ. Chi tiết: Đơn giá lệch: Hóa đơn (2750000.0) vs PO (2500000.0)	Cần kiểm tra kỹ lưỡng và yêu cầu Nhà cung cấp giải trình/xuất lại hóa đơn.	27500000.00	MISMATCH_PRICE	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
6dd7ec0d-442c-4d7a-b4f5-c40dc5660678	DOC-0097	0000097	PO-2026-000097	GRN-2026-000097	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	990000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
7a6b10a0-7876-4df1-aa41-27ec126d76aa	DOC-0098	0000098	PO-2026-000098	GRN-2026-000098	NHÀ IN QUẢNG CÁO VIỆT	0314567890	2026-08-07	38500000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
1e123a96-4099-44ca-be0f-1457b2bf58dc	DOC-0099	0000099	PO-2026-000099	GRN-2026-000099	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	20900000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
81a299a2-230b-4d55-b1ad-d6adef0b53b6	DOC-0100	0000100	PO-2026-000100	GRN-2026-000100	CÔNG TY TNHH PHỤ TÙNG Ô TÔ XE MÁY MIỀN BẮC	0107654321	2026-08-07	352000000.00	matched	low	1.0000	Khớp 3 bên thành công.	Dữ liệu hóa đơn khớp hoàn toàn với Đơn đặt hàng (PO) và Phiếu nhập kho (GRN).	Hồ sơ hoàn toàn hợp lệ, có thể duyệt tự động.	0.00	MATCH	\N	\N	\N	\N	2026-08-07 09:58:48.062994+00	2026-08-07 09:58:48.062994+00
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.role_permissions (role_id, permission_id, created_at) FROM stdin;
5645989a-3a08-4503-a7d1-5a7cf3ae835a	8709dadf-6fac-496b-a9dd-46125c868de2	2026-08-05 08:30:08.76649+00
5645989a-3a08-4503-a7d1-5a7cf3ae835a	da3de37f-8482-4dd6-82b7-8fe144f3adfc	2026-08-05 08:30:08.76649+00
5645989a-3a08-4503-a7d1-5a7cf3ae835a	fe30f73d-1094-4f00-b894-b95e21209495	2026-08-05 08:30:08.76649+00
5ab98d72-3633-4efa-839a-de630b551e72	8709dadf-6fac-496b-a9dd-46125c868de2	2026-08-05 08:30:08.76858+00
5ab98d72-3633-4efa-839a-de630b551e72	a550558d-f465-4dda-867a-3b423dc64b30	2026-08-05 08:30:08.76858+00
5ab98d72-3633-4efa-839a-de630b551e72	fe30f73d-1094-4f00-b894-b95e21209495	2026-08-05 08:30:08.76858+00
5ab98d72-3633-4efa-839a-de630b551e72	fc21052a-0f9f-4c23-bf72-1eab1a6c60c7	2026-08-05 08:30:08.76858+00
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.roles (id, code, name, description, is_active, created_at, updated_at) FROM stdin;
5645989a-3a08-4503-a7d1-5a7cf3ae835a	accountant	Kế toán viên	Thực hiện đối soát hóa đơn, tải chứng từ và theo dõi nhật ký nghiệp vụ.	t	2026-08-05 08:30:08.764484+00	2026-08-05 08:30:08.764484+00
5ab98d72-3633-4efa-839a-de630b551e72	chief_accountant	Kế toán trưởng	Theo dõi tổng quan, phê duyệt đối soát và cấu hình quy trình.	t	2026-08-05 08:30:08.764484+00	2026-08-05 08:30:08.764484+00
\.


--
-- Data for Name: thresholds; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.thresholds (id, category, percent_threshold, absolute_threshold, updated_by_id, updated_at, created_at) FROM stdin;
52cfe237-1391-45b7-a0c9-0e6dcdea9da6	Phụ tùng ô tô	3.00	5000000.00	\N	2026-08-07 08:13:44.577119+00	2026-08-07 08:13:44.577119+00
c800e7b8-aa7e-43e8-bd5a-6f6634c3d2bb	Nhiên liệu	5.00	10000000.00	\N	2026-08-07 08:13:44.577119+00	2026-08-07 08:13:44.577119+00
b3fbff2c-2d6a-45d4-bc07-f4384438fa03	Bảo hiểm	1.00	2000000.00	\N	2026-08-07 08:13:44.577119+00	2026-08-07 08:13:44.577119+00
4619f2f5-e916-472a-b5f2-7d479d9781a6	Dịch vụ sửa chữa	5.00	8000000.00	\N	2026-08-07 08:13:44.577119+00	2026-08-07 08:13:44.577119+00
180c66d8-90a3-4dc7-9aaa-7a441162a464	Công nghệ / Phần mềm	2.00	3000000.00	\N	2026-08-07 08:13:44.577119+00	2026-08-07 08:13:44.577119+00
ccabbb49-fc19-4b18-b806-836f7e6c8ba4	Mặc định (tất cả)	3.00	5000000.00	\N	2026-08-07 08:13:44.577119+00	2026-08-07 08:13:44.577119+00
\.


--
-- Data for Name: uploaded_files; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.uploaded_files (id, filename, size, status, progress, error_message, case_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.user_sessions (id, user_id, session_token_hash, ip_address, user_agent, expires_at, revoked_at, created_at) FROM stdin;
26b2e241-a3b2-44b7-8149-6ebe4f9cb37f	e4faca71-c430-4e17-a857-b38eda5014db	5f372ebf9dec308a3654e20c347e05bb900b4c2914d0036770cdaa6b76ae9f36	172.21.0.4	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0	2026-08-07 19:04:56.086032+00	\N	2026-08-07 07:04:56.038469+00
76818292-ada8-4e86-8121-824471a46d94	e4faca71-c430-4e17-a857-b38eda5014db	04053e823f50b2513cc85fa6962204875c63d3c147c293d25538f57dc70e9f25	172.21.0.4	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0	2026-08-07 20:27:33.483938+00	\N	2026-08-07 08:27:33.446011+00
77c1e7a3-5898-4373-adc0-6280029bc3a4	e4faca71-c430-4e17-a857-b38eda5014db	abd8f23d2de273b9126022599be0b05e0bb3fcc10bc24ec73f91b15692c90cdb	172.21.0.4	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0	2026-08-07 21:48:19.873655+00	\N	2026-08-07 09:48:19.838946+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: admin
--

COPY public.users (id, email, password_hash, full_name, role_id, department, employee_code, status, last_login_at, created_at, updated_at, date_of_birth, address, citizen_id, phone, avatar_url) FROM stdin;
06710574-f4d0-4b0c-8812-ba0130a1cd25	accountant@docusync.ai	$2a$06$NLocq9160tBpu53KBIDOcOIf6yAI651k17MkimGgsW/YMXBk/GlkK	Nguyễn Thị Lan	5645989a-3a08-4503-a7d1-5a7cf3ae835a	Phòng Kế toán - Tài chính	ACC-001	ACTIVE	\N	2026-08-05 08:30:08.769461+00	2026-08-05 08:30:08.769461+00	\N	\N	\N	\N	\N
e4faca71-c430-4e17-a857-b38eda5014db	chief.accountant@docusync.ai	$2a$06$fngQyPRVO.1Nx43Xjy.mGuwW73Hk3Wwwvvr5ZWpdZsCmbFpbB6TiS	Trần Văn Minh	5ab98d72-3633-4efa-839a-de630b551e72	Phòng Kế toán - Tài chính	CHIEF-001	ACTIVE	2026-08-07 09:48:19.873763+00	2026-08-05 08:30:08.773901+00	2026-08-07 09:48:19.838946+00	\N	\N	\N	\N	\N
\.


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: admin
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 8, true);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: goods_receipt_note_items goods_receipt_note_items_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.goods_receipt_note_items
    ADD CONSTRAINT goods_receipt_note_items_pkey PRIMARY KEY (id);


--
-- Name: goods_receipt_notes goods_receipt_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_pkey PRIMARY KEY (id);


--
-- Name: line_items line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.line_items
    ADD CONSTRAINT line_items_pkey PRIMARY KEY (id);


--
-- Name: password_reset_otps password_reset_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.password_reset_otps
    ADD CONSTRAINT password_reset_otps_pkey PRIMARY KEY (id);


--
-- Name: password_reset_otps password_reset_otps_reset_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.password_reset_otps
    ADD CONSTRAINT password_reset_otps_reset_token_hash_key UNIQUE (reset_token_hash);


--
-- Name: permissions permissions_code_key; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_code_key UNIQUE (code);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: reconciliation_cases reconciliation_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.reconciliation_cases
    ADD CONSTRAINT reconciliation_cases_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_code_key; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_code_key UNIQUE (code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: thresholds thresholds_category_key; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.thresholds
    ADD CONSTRAINT thresholds_category_key UNIQUE (category);


--
-- Name: thresholds thresholds_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.thresholds
    ADD CONSTRAINT thresholds_pkey PRIMARY KEY (id);


--
-- Name: uploaded_files uploaded_files_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_session_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_session_token_hash_key UNIQUE (session_token_hash);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_employee_code_key; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_employee_code_key UNIQUE (employee_code);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ix_goods_receipt_note_items_grn_id; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX ix_goods_receipt_note_items_grn_id ON public.goods_receipt_note_items USING btree (grn_id);


--
-- Name: ix_goods_receipt_notes_grn_number; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX ix_goods_receipt_notes_grn_number ON public.goods_receipt_notes USING btree (grn_number);


--
-- Name: ix_goods_receipt_notes_po_number; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX ix_goods_receipt_notes_po_number ON public.goods_receipt_notes USING btree (po_number);


--
-- Name: ix_line_items_case_id; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX ix_line_items_case_id ON public.line_items USING btree (case_id);


--
-- Name: ix_purchase_order_items_po_id; Type: INDEX; Schema: public; Owner: admin
--

CREATE INDEX ix_purchase_order_items_po_id ON public.purchase_order_items USING btree (po_id);


--
-- Name: ix_purchase_orders_po_number; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX ix_purchase_orders_po_number ON public.purchase_orders USING btree (po_number);


--
-- Name: ix_reconciliation_cases_case_number; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX ix_reconciliation_cases_case_number ON public.reconciliation_cases USING btree (case_number);


--
-- Name: ix_users_citizen_id_unique; Type: INDEX; Schema: public; Owner: admin
--

CREATE UNIQUE INDEX ix_users_citizen_id_unique ON public.users USING btree (citizen_id) WHERE (citizen_id IS NOT NULL);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: goods_receipt_note_items goods_receipt_note_items_grn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.goods_receipt_note_items
    ADD CONSTRAINT goods_receipt_note_items_grn_id_fkey FOREIGN KEY (grn_id) REFERENCES public.goods_receipt_notes(id) ON DELETE CASCADE;


--
-- Name: line_items line_items_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.line_items
    ADD CONSTRAINT line_items_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.reconciliation_cases(id) ON DELETE CASCADE;


--
-- Name: password_reset_otps password_reset_otps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.password_reset_otps
    ADD CONSTRAINT password_reset_otps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: purchase_order_items purchase_order_items_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: reconciliation_cases reconciliation_cases_processed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.reconciliation_cases
    ADD CONSTRAINT reconciliation_cases_processed_by_id_fkey FOREIGN KEY (processed_by_id) REFERENCES public.users(id);


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: thresholds thresholds_updated_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.thresholds
    ADD CONSTRAINT thresholds_updated_by_id_fkey FOREIGN KEY (updated_by_id) REFERENCES public.users(id);


--
-- Name: uploaded_files uploaded_files_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.uploaded_files
    ADD CONSTRAINT uploaded_files_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.reconciliation_cases(id) ON DELETE SET NULL;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: admin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- PostgreSQL database dump complete
--

\unrestrict KxBsjLyC5ubcbUHiGquNlsnKaivCPkijogWO6YeaySca8KnEhV4dPvY7qAPSfOB

