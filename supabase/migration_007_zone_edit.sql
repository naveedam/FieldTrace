-- ============================================================================
-- FieldTrace -- Migration 007: Editable Zones
-- Run this AFTER migrations 1-6, same project. No schema/architecture
-- changes -- one additive, org-scoped RPC using existing columns only.
--
-- zone_id (the primary key, and what every asset/work-log/floor-plan-tag/
-- client-share references) is never touched here -- editing a zone only
-- updates floor_level, zone_type, and tenant_name in place, so every
-- existing FK reference to this zone stays valid automatically.
-- ============================================================================

create or replace function ft_update_zone(
  p_zone_id     text,
  p_floor_level text,
  p_zone_type   text,
  p_tenant_name text
) returns ft_zones
language plpgsql security definer set search_path = public as $$
declare
  v_zone ft_zones;
begin
  update ft_zones
    set floor_level = p_floor_level,
        zone_type   = p_zone_type,
        tenant_name = nullif(p_tenant_name, '')
    where zone_id = p_zone_id and org_id = ft_current_org_id()
    returning * into v_zone;

  if v_zone is null then
    raise exception 'Unknown zone';
  end if;

  return v_zone;
end;
$$;

grant execute on function ft_update_zone to authenticated;
