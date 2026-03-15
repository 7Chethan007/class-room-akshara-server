const fs = require('fs');
const path = require('path');
const { Upload } = require('@aws-sdk/lib-storage');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getS3Client } = require('../config/s3');
const { getSessionDir } = require('./sessionArtifacts');

const bucket = process.env.S3_BUCKET || process.env.AWS_BUCKET;
const uploadEnabled = process.env.UPLOAD_TO_S3 === 'true';

/**
 * uploadFile — uploads a single file to S3 with the provided key.
 */
async function uploadFile(localPath, key) {
  if (!uploadEnabled) {
    return { success: false, message: 'S3 upload disabled (UPLOAD_TO_S3 != true)' };
  }
  if (!bucket) {
    throw new Error('S3_BUCKET/AWS_BUCKET is not set');
  }
  const client = getS3Client();
  const fileStream = fs.createReadStream(localPath);
  const uploader = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: fileStream,
    },
  });
  await uploader.done();
  return { success: true, key, url: `s3://${bucket}/${key}` };
}

/**
 * uploadSessionDirectory — uploads all files under recordings/{teacherId}/{sessionId}
 */
async function uploadSessionDirectory({ teacherId, sessionId }) {
  if (!uploadEnabled) {
    return { success: false, message: 'S3 upload disabled' };
  }
  const dir = getSessionDir({ teacherId, sessionId });
  if (!fs.existsSync(dir)) {
    throw new Error(`Session directory not found: ${dir}`);
  }

  const results = [];
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const absolute = path.join(dir, file);
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) continue;
    const key = `recordings/${sessionId}/${file}`;
    try {
      const res = await uploadFile(absolute, key);
      results.push(res);
    } catch (err) {
      results.push({ success: false, key, error: err.message });
    }
  }
  return results;
}

module.exports = { uploadFile, uploadSessionDirectory };
