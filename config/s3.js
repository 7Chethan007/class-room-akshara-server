const { S3Client } = require('@aws-sdk/client-s3');

/**
 * Returns a configured S3 client using env credentials.
 * Expects AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION.
 */
function getS3Client() {
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error('AWS_REGION is not set');
  }
  return new S3Client({
    region,
    credentials: process.env.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined, // allow instance/profile creds
  });
}

module.exports = { getS3Client };
