// API test endpoint
export default function handler(req, res) {
  res.status(200).json({ 
    message: 'Tony Miller Exhibition API is LIVE!',
    timestamp: new Date().toISOString()
  });
}