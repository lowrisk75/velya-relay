--
-- Velya Cloud Relay - Database Schema
-- PostgreSQL 16+
--

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    email_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE users IS 'Registered users (Phase 3: public registration)';

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
    device_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    apns_token TEXT,
    device_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE devices IS 'Registered iOS devices';

-- Alarms table
CREATE TABLE IF NOT EXISTS alarms (
    alarm_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    hour SMALLINT NOT NULL CHECK (hour >= 0 AND hour <= 23),
    minute SMALLINT NOT NULL CHECK (minute >= 0 AND minute <= 59),
    is_active BOOLEAN DEFAULT TRUE,
    label TEXT,
    repeat_days SMALLINT[] DEFAULT ARRAY[]::SMALLINT[],
    scheduled_date DATE,
    timezone TEXT DEFAULT 'UTC',
    snoozed_until TIMESTAMP WITH TIME ZONE,
    created_by TEXT DEFAULT 'remote',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE alarms IS 'Persistent storage for device alarms';
COMMENT ON COLUMN alarms.repeat_days IS 'Array of weekdays (0=Sun, 6=Sat). Empty = one-time alarm';
COMMENT ON COLUMN alarms.scheduled_date IS 'Optional: specific date for one-time alarms';
COMMENT ON COLUMN alarms.timezone IS 'Device timezone (IANA format)';

-- Alarm events table
CREATE TABLE IF NOT EXISTS alarm_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alarm_id UUID NOT NULL REFERENCES alarms(alarm_id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('fired', 'snoozed', 'dismissed')),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    snooze_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE alarm_events IS 'Events from iPhone: alarm fired, snoozed, dismissed';

-- Node-RED API keys table
CREATE TABLE IF NOT EXISTS node_red_keys (
    key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    scopes TEXT[] DEFAULT ARRAY['command:send', 'device:read'],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE node_red_keys IS 'API keys for Node-RED/Home Assistant integration';

-- Webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    webhook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT[] DEFAULT ARRAY['alarm_set', 'alarm_fired', 'alarm_dismissed'],
    secret TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE webhooks IS 'Webhook endpoints for alarm events';

-- Webhook deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(webhook_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    response_status SMALLINT,
    response_body TEXT,
    attempts SMALLINT DEFAULT 1,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery log';

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    device_id UUID REFERENCES devices(device_id) ON DELETE SET NULL,
    request_id UUID,
    command_type TEXT,
    ack_status TEXT,
    ip_cidr TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'Command audit trail';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
CREATE INDEX IF NOT EXISTS idx_alarms_device ON alarms(device_id);
CREATE INDEX IF NOT EXISTS idx_alarms_user ON alarms(user_id);
CREATE INDEX IF NOT EXISTS idx_alarms_active ON alarms(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_alarm_events_alarm ON alarm_events(alarm_id);
CREATE INDEX IF NOT EXISTS idx_alarm_events_device ON alarm_events(device_id);
CREATE INDEX IF NOT EXISTS idx_alarm_events_timestamp ON alarm_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_node_red_keys_user ON node_red_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);

-- Trigger for alarms updated_at
CREATE OR REPLACE FUNCTION update_alarms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_alarms_updated_at
BEFORE UPDATE ON alarms
FOR EACH ROW
EXECUTE FUNCTION update_alarms_updated_at();

-- Insert default system user (for legacy/test devices)
INSERT INTO users (user_id, email, email_verified, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'system@velya.local', TRUE, TRUE)
ON CONFLICT (user_id) DO NOTHING;

-- Grant permissions (optional, adjust as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO velya_app;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO velya_app;
