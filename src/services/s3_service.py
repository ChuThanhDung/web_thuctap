import boto3
from botocore.config import Config

from src.config import get_settings


def get_s3_client():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.storage_endpoint_url or None,
        aws_access_key_id=settings.storage_access_key_id or None,
        aws_secret_access_key=settings.storage_secret_access_key or None,
        region_name=settings.storage_region,
        config=Config(
            signature_version="s3v4",
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
            s3={"checksum_algorithm": "when_required"},
        ),
    )


def upload_file_to_object_storage(file_bytes: bytes, storage_key: str, content_type: str) -> None:
    settings = get_settings()
    if not settings.storage_bucket:
        raise ValueError("STORAGE_BUCKET is required when using cloud storage.")

    get_s3_client().put_object(
        Bucket=settings.storage_bucket,
        Key=storage_key,
        Body=file_bytes,
        ContentType=content_type,
    )


def download_file_from_object_storage(storage_key: str) -> tuple[bytes, str | None]:
    settings = get_settings()
    if not settings.storage_bucket:
        raise ValueError("STORAGE_BUCKET is required when using cloud storage.")

    response = get_s3_client().get_object(Bucket=settings.storage_bucket, Key=storage_key)
    body = response["Body"]
    try:
        return body.read(), response.get("ContentType")
    finally:
        body.close()


def delete_file_from_object_storage(storage_key: str) -> None:
    settings = get_settings()
    if not settings.storage_bucket:
        raise ValueError("STORAGE_BUCKET is required when using cloud storage.")

    get_s3_client().delete_object(Bucket=settings.storage_bucket, Key=storage_key)


def list_object_storage_keys(prefix: str) -> list[str]:
    settings = get_settings()
    if not settings.storage_bucket:
        raise ValueError("STORAGE_BUCKET is required when using cloud storage.")

    client = get_s3_client()
    keys: list[str] = []
    continuation_token = None

    while True:
        params = {
            "Bucket": settings.storage_bucket,
            "Prefix": prefix,
        }
        if continuation_token:
            params["ContinuationToken"] = continuation_token

        response = client.list_objects_v2(**params)
        keys.extend(item["Key"] for item in response.get("Contents", []))

        if not response.get("IsTruncated"):
            break
        continuation_token = response.get("NextContinuationToken")

    return keys


def generate_presigned_url(storage_key: str, expiration: int | None = None) -> str:
    settings = get_settings()
    if not settings.storage_bucket:
        raise ValueError("STORAGE_BUCKET is required when using cloud storage.")

    return get_s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.storage_bucket, "Key": storage_key},
        ExpiresIn=expiration or settings.storage_presigned_url_expiration_seconds,
    )
