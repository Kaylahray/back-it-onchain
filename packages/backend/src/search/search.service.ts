import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  SearchResponseDto,
  UserSearchResult,
  CallSearchResult,
  TokenSearchResult,
} from './dto/search.dto';

export interface SearchOptions {
  chain?: 'base' | 'stellar';
  status?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class SearchService {
  constructor(private readonly dataSource: DataSource) {}

  async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResponseDto> {
    const sanitized = this.sanitize(query.trim());
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? 10));
    const offset = (page - 1) * limit;

    const [users, calls, tokens] = await Promise.all([
      this.searchUsers(sanitized, limit),
      this.searchCalls(sanitized, limit, offset, options),
      this.searchTokens(sanitized, limit),
    ]);

    return {
      users,
      calls,
      tokens,
      meta: {
        query: sanitized,
        page,
        limit,
        total: users.length + calls.length + tokens.length,
        totalPages: 1,
      },
    };
  }

  private async searchUsers(
    query: string,
    limit: number,
  ): Promise<UserSearchResult[]> {
    const tsQuery = this.toTsQuery(query);
    const pattern = `%${query}%`;

    const results = await this.dataSource.query(
      `
      SELECT
        u.id,
        u."displayName",
        u.address,
        u.avatar
      FROM "user" u
      WHERE
        to_tsvector('english', coalesce(u."displayName", '') || ' ' || coalesce(u.address, ''))
          @@ plainto_tsquery('english', $1)
        OR u."displayName" ILIKE $2
        OR u.address ILIKE $2
        OR similarity(coalesce(u."displayName", ''), $3) > 0.2
      ORDER BY
        GREATEST(
          ts_rank(
            to_tsvector('english', coalesce(u."displayName", '') || ' ' || coalesce(u.address, '')),
            plainto_tsquery('english', $1)
          ),
          similarity(coalesce(u."displayName", ''), $3)
        ) DESC
      LIMIT $4
      `,
      [tsQuery, pattern, query, limit],
    ).catch(() => []);

    return results.map((r: any) => ({
      id: r.id,
      displayName: r.displayName,
      address: r.address,
      avatar: r.avatar ?? null,
    }));
  }

  private async searchCalls(
    query: string,
    limit: number,
    offset: number,
    options: SearchOptions,
  ): Promise<CallSearchResult[]> {
    const tsQuery = this.toTsQuery(query);
    const pattern = `%${query}%`;

    const filters: string[] = [`c."isHidden" = false`];
    const params: unknown[] = [tsQuery, pattern, query, limit, offset];

    if (options.chain) {
      filters.push(`c.chain = $${params.length + 1}`);
      params.push(options.chain);
    }
    if (options.status) {
      filters.push(`c.status = $${params.length + 1}`);
      params.push(options.status);
    }

    const where = filters.join(' AND ');

    const results = await this.dataSource.query(
      `
      SELECT
        c.id,
        c.title,
        c.description,
        c.chain,
        c.status,
        c."createdAt"
      FROM "call" c
      WHERE
        (to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.description, ''))
          @@ plainto_tsquery('english', $1)
        OR c.title ILIKE $2
        OR c.description ILIKE $2
        OR similarity(coalesce(c.title, ''), $3) > 0.2)
        AND ${where}
      ORDER BY
        ts_rank(
          to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.description, '')),
          plainto_tsquery('english', $1)
        ) DESC
      LIMIT $4 OFFSET $5
      `,
      params,
    ).catch(() => []);

    return results.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      chain: r.chain,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  private async searchTokens(
    query: string,
    limit: number,
  ): Promise<TokenSearchResult[]> {
    const tsQuery = this.toTsQuery(query);
    const pattern = `%${query}%`;

    const results = await this.dataSource.query(
      `
      SELECT
        t.id,
        t.name,
        t.symbol,
        t.address
      FROM "token" t
      WHERE
        to_tsvector('english', coalesce(t.name, '') || ' ' || coalesce(t.symbol, ''))
          @@ plainto_tsquery('english', $1)
        OR t.name ILIKE $2
        OR t.symbol ILIKE $2
        OR t.address ILIKE $2
        OR similarity(coalesce(t.name, ''), $3) > 0.2
      ORDER BY
        GREATEST(
          ts_rank(
            to_tsvector('english', coalesce(t.name, '') || ' ' || coalesce(t.symbol, '')),
            plainto_tsquery('english', $1)
          ),
          similarity(coalesce(t.name, ''), $3)
        ) DESC
      LIMIT $4
      `,
      [tsQuery, pattern, query, limit],
    ).catch(() => []);

    return results.map((r: any) => ({
      id: r.id,
      name: r.name,
      symbol: r.symbol,
      address: r.address,
    }));
  }

  private sanitize(query: string): string {
    // Remove characters that would break a tsquery / ILIKE pattern
    return query.replace(/[^\p{L}\p{N}\s._@-]/gu, '').slice(0, 200);
  }

  private toTsQuery(query: string): string {
    return query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean)
      .join(' & ');
  }
}
