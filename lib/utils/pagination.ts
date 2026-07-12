export interface LimitOptions {
  defaultLimit?: number;
  maxLimit?: number;
  minLimit?: number;
}

export function parseLimit(rawLimit: any, options: LimitOptions = {}): number {
  const {
    defaultLimit = 50,
    maxLimit = 200,
    minLimit = 1,
  } = options;

  const parsed = Number.parseInt(String(rawLimit), 10);
  const normalizedLimit = parsed || defaultLimit;

  return Math.min(Math.max(normalizedLimit, minLimit), maxLimit);
}

export interface PaginationOptions {
  defaultPage?: number;
  defaultPageSize?: number;
  maxPageSize?: number;
}

export interface ParsedPagination {
  page: number;
  pageSize: number;
  offset: number;
}

export function parsePagination(rawPage: any, rawPageSize: any, options: PaginationOptions = {}): ParsedPagination {
  const {
    defaultPage = 1,
    defaultPageSize = 50,
    maxPageSize = 200,
  } = options;

  const page = Math.max(
    Number.parseInt(String(rawPage), 10) || defaultPage,
    1,
  );

  const pageSize = parseLimit(rawPageSize, {
    defaultLimit: defaultPageSize,
    maxLimit: maxPageSize,
    minLimit: 1,
  });

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}
