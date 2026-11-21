BEGIN;

CREATE FUNCTION public.rental_custom_lease_rates_valid(rates jsonb, minimum_months smallint)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(rates) = 'array' AND octet_length(rates::text) <= 1600 THEN (
    SELECT count(*) = count(DISTINCT package->>'months') AND coalesce(bool_and(
      CASE WHEN jsonb_typeof(package) = 'object'
        AND jsonb_typeof(package->'months') = 'number'
        AND jsonb_typeof(package->'amount') = 'number'
        AND package->>'months' ~ '^[0-9]{1,2}$'
        AND package->>'amount' ~ '^[0-9]{1,10}$'
      THEN package - 'months' - 'amount' = '{}'::jsonb
        AND (package->>'months')::integer BETWEEN greatest(2, coalesce(minimum_months, 1)) AND 60
        AND (package->>'months')::integer NOT IN (3, 6, 12)
        AND (package->>'amount')::bigint BETWEEN 1 AND 1000000000
      ELSE false END
    ), true)
    FROM jsonb_array_elements(rates) AS items(package)
  ) ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.rental_custom_lease_rates_valid(jsonb, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rental_custom_lease_rates_valid(jsonb, smallint) TO authenticated, service_role;

ALTER TABLE public.rental_listings
  ADD COLUMN minimum_lease_months smallint CHECK (minimum_lease_months BETWEEN 1 AND 60),
  ADD COLUMN deposit_months smallint CHECK (deposit_months BETWEEN 0 AND 2),
  ADD COLUMN three_month_rent integer CHECK (three_month_rent BETWEEN 1 AND 1000000000),
  ADD COLUMN custom_lease_rates jsonb NOT NULL DEFAULT '[]'::jsonb,
  DROP CONSTRAINT rental_listings_offer_prices,
  ADD CONSTRAINT rental_listings_lease_packages CHECK (
    public.rental_custom_lease_rates_valid(custom_lease_rates, minimum_lease_months)
    AND CASE WHEN jsonb_typeof(custom_lease_rates) = 'array' THEN
      jsonb_array_length(custom_lease_rates) + num_nonnulls(three_month_rent, six_month_rent, yearly_rent) <= 8
    ELSE false END
    AND (three_month_rent IS NULL OR coalesce(minimum_lease_months, 1) <= 3)
    AND (six_month_rent IS NULL OR coalesce(minimum_lease_months, 1) <= 6)
    AND (yearly_rent IS NULL OR coalesce(minimum_lease_months, 1) <= 12)
  ),
  ADD CONSTRAINT rental_listings_offer_prices CHECK (
    CASE WHEN offer_type = 'sale' THEN
      num_nonnulls(monthly_rent, three_month_rent, six_month_rent, yearly_rent, minimum_lease_months, deposit_months) = 0
      AND custom_lease_rates = '[]'::jsonb
    ELSE
      (offer_type <> 'rent' OR sale_price IS NULL)
      AND (num_nonnulls(monthly_rent, three_month_rent, six_month_rent, yearly_rent) > 0 OR custom_lease_rates <> '[]'::jsonb)
    END
  );

GRANT INSERT (minimum_lease_months, deposit_months, three_month_rent, custom_lease_rates),
  UPDATE (minimum_lease_months, deposit_months, three_month_rent, custom_lease_rates)
  ON public.rental_listings TO authenticated;

COMMIT;
