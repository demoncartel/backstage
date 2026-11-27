import { server } from './app.js';

const port = Number(process.env.PORT ?? 8080);
server.listen(port, () => console.log(`${{ values.name }} listening on ${port}`));
