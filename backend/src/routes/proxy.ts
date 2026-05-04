import express from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { getContainerPorts } from '../services/container.js';

const router = express.Router();

// Middleware to resolve container port to host port
router.use('/:userId/:language/:port', (req, res, next) => {
    const { userId, language, port } = req.params;
    const ports = getContainerPorts(userId, language);
    
    if (!ports) {
        res.status(404).send('Container is not running. Please start a terminal first.');
        return;
    }

    const hostPort = ports.get(parseInt(port, 10));
    if (!hostPort) {
        res.status(404).send(`Port ${port} is not exposed by the container.`);
        return;
    }

    // Attach hostPort to request for the proxy
    (req as any).targetHostPort = hostPort;
    next();
});

// Proxy the request
router.use('/:userId/:language/:port', createProxyMiddleware({
    router: (req) => {
        const hostPort = (req as any).targetHostPort;
        return `http://localhost:${hostPort}`;
    },
    changeOrigin: true,
    ws: true,
    pathRewrite: (path, req) => {
        const { userId, language, port } = (req as express.Request).params;
        const prefix = `/api/proxy/${userId}/${language}/${port}`;
        return path.replace(prefix, ''); // Strip prefix before forwarding
    },
    // We rewrite the HTML response to fix absolute paths like /_next/static to point to our proxy
    selfHandleResponse: true,
    on: {
        proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
            const { userId, language, port } = (req as express.Request).params;
            const prefix = `/api/proxy/${userId}/${language}/${port}`;
            
            // Only rewrite HTML files
            const contentType = proxyRes.headers['content-type'];
            if (contentType && contentType.includes('text/html')) {
                let html = responseBuffer.toString('utf8');
                
                // Basic regex to rewrite absolute paths in src, href, and action attributes
                // This transforms src="/_next/static/..." into src="/api/proxy/.../_next/static/..."
                html = html.replace(/(src|href|action)="\/([^"]+)"/g, `$1="${prefix}/$2"`);
                
                return html;
            }
            
            return responseBuffer;
        })
    }
}));

export default router;
