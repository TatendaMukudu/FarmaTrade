"use client";

import { useState } from "react";
import { regionFor, supportedRegions, PILOT_COUNTRY, type Region } from "@/lib/regions";

// The one place FarmaTrade asks a farmer where they are.
//
// Every form used to hard-code "Province" and a Zimbabwean dropdown, which
// meant a Kenyan farmer was asked for an administrative unit their country
// does not have. Here the labels and the options both come from the region
// pack, so the question a farmer is asked is the one their own country would
// ask, and a country we have no list for gets a free-text field rather than
// being unusable.

function LabelledField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

const CONTROL = "rounded-control border border-border px-3 py-2 text-sm";

function Level1Input({
  region,
  defaultValue,
  idPrefix,
}: {
  region: Region;
  defaultValue?: string;
  idPrefix: string;
}) {
  // A country whose divisions we haven't entered still has to be usable —
  // onboarding a new market shouldn't wait on a code change.
  if (region.level1.length === 0) {
    return (
      <input
        id={`${idPrefix}province`}
        name="province"
        required
        defaultValue={defaultValue}
        placeholder={region.labels.level1}
        className={CONTROL}
      />
    );
  }

  return (
    <select
      id={`${idPrefix}province`}
      name="province"
      required
      defaultValue={defaultValue ?? ""}
      className={CONTROL}
    >
      <option value="" disabled>
        Select {region.labels.level1.toLowerCase()}
      </option>
      {region.level1.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

// Used where the country is already known and settled (posting, settings):
// the farmer isn't asked it again, they're just asked for their place in the
// vocabulary of the country they're already in.
export function LocationFields({
  countryCode,
  defaultProvince,
  defaultDistrict,
  idPrefix = "",
}: {
  countryCode: string;
  defaultProvince?: string;
  defaultDistrict?: string;
  idPrefix?: string;
}) {
  const region = regionFor(countryCode);
  return (
    <>
      <LabelledField label={region.labels.level1} htmlFor={`${idPrefix}province`}>
        <Level1Input region={region} defaultValue={defaultProvince} idPrefix={idPrefix} />
      </LabelledField>
      <LabelledField label={region.labels.level2} htmlFor={`${idPrefix}district`}>
        <input
          id={`${idPrefix}district`}
          name="district"
          required
          defaultValue={defaultDistrict}
          placeholder={region.labels.level2}
          className={CONTROL}
        />
      </LabelledField>
    </>
  );
}

// Used at signup, where the country is the thing being chosen. Changing it
// re-labels and re-populates the fields below in the same breath, so a
// farmer never sees Zimbabwe's vocabulary on their way to picking Kenya.
export function CountryAndLocationFields({
  defaultCountry = PILOT_COUNTRY,
}: {
  defaultCountry?: string;
}) {
  const [countryCode, setCountryCode] = useState(defaultCountry);
  const region = regionFor(countryCode);

  return (
    <>
      <LabelledField label="Country" htmlFor="countryCode">
        <select
          id="countryCode"
          name="countryCode"
          required
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          className={CONTROL}
        >
          {supportedRegions().map((r) => (
            <option key={r.code} value={r.code}>
              {r.country}
            </option>
          ))}
        </select>
      </LabelledField>
      {/* Keyed on the country so switching it clears a selection that
          belonged to the previous one — a Harare left sitting in a Kenyan
          form would be saved as though the farmer meant it. */}
      <LabelledField label={region.labels.level1} htmlFor="province">
        <Level1Input key={countryCode} region={region} idPrefix="" />
      </LabelledField>
      <LabelledField label={region.labels.level2} htmlFor="district">
        <input
          key={countryCode}
          id="district"
          name="district"
          required
          placeholder={region.labels.level2}
          className={CONTROL}
        />
      </LabelledField>
    </>
  );
}
