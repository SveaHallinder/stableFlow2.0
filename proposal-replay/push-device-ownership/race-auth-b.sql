\set ON_ERROR_STOP on
begin;
set local application_name='sf_device_auth_delete';
set local statement_timeout='20s';
select push_fixture.synthetic_auth_delete_paused(push_fixture.pid('A'));
commit;
