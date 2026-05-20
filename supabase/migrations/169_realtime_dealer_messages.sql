-- Enable Realtime on dealer_messages so clients receive live inserts.
ALTER PUBLICATION supabase_realtime ADD TABLE dealer_messages;
