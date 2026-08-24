import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": req.headers.get("origin") ?? "https://vorcelab.app",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("garmin_connections")
    .select("garmin_user_id, scope, connected_at, last_sync_at, revoked_at, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("garmin-status lookup failed");
    return Response.json({ error: "Failed to read Garmin status" }, { status: 500 });
  }

  return Response.json({
    configured: Boolean(Deno.env.get("GARMIN_CLIENT_ID")) && Boolean(Deno.env.get("GARMIN_CLIENT_SECRET")),
    connected: Boolean(data && !data.revoked_at && data.connected_at),
    connection: data ?? null,
    developer_access_required: !Deno.env.get("GARMIN_CLIENT_ID") || !Deno.env.get("GARMIN_CLIENT_SECRET"),
  }, {
    headers: { "Access-Control-Allow-Origin": req.headers.get("origin") ?? "https://vorcelab.app" },
  });
});
