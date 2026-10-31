import { Icon } from '../components/Icon';

// The source credit and the honest limits of the tender search, shown above
// every list of tenders. CPPP asks that its material be reproduced
// accurately with the source prominently acknowledged.
export function SourceNote() {
  return (
    <div className="notice notice-info tb-source">
      <Icon name="info" />
      <span className="notice-text">
        Source: <a href="https://eprocure.gov.in/cppp/" target="_blank" rel="noopener noreferrer">Central Public Procurement Portal</a> (CPPP),
        Government of India, copied as published. Not every tender in India is listed there. Portals ask for a captcha
        before showing a tender: search for its tender ID there, and confirm the details before you bid.
      </span>
    </div>
  );
}
