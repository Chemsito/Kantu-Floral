-- pg_net expone sus funciones en el esquema "net"; el objeto de extensión
-- no debe quedar registrado en public (lint 0014_extension_in_public).
-- Las funciones de avisos llaman a net.http_post/net.http_get en tiempo de
-- ejecución, por lo que recrear la extensión no las afecta.
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
