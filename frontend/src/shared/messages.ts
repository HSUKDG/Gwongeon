export type HansungPageSource =
  | "hansung-main"
  | "hansung-notice"
  | "info-system"
  | "eclass"
  | "portal"
  | "unknown";

export type HansungPageLink = {
  text: string;
  url: string;
};

export type HansungPageContext = {
  source: HansungPageSource;
  title: string;
  url: string;
  heading: string;
  date: string;
  bodyText: string;
  links: HansungPageLink[];
  notices: HansungPageLink[];
  selection: string;
  capturedAt: string;
};

export type HansungLinkMessage =
  | {
      type: "HANSUNG_LINK_PAGE_CONTEXT";
      payload: HansungPageContext;
    }
  | {
      type: "HANSUNG_LINK_GET_PAGE_CONTEXT";
    }
  | {
      type: "HANSUNG_LINK_TOGGLE_OVERLAY";
    };
