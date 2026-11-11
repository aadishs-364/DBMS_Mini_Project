/** @type {import('next').NextConfig} */
const nextConfig = {
  // the embedding library loads native code and model files, so Next must not bundle it
  serverExternalPackages: ['@huggingface/transformers'],
  devIndicators: false,
};

export default nextConfig;
