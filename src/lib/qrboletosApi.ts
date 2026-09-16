/**
 * Cliente para el consumo de las APIs de Eventry / QRBoletos
 * Documentacion oficial:
 * - Customers API: https://developers.qrboletos.com/reference/api/customers-api-v1.aspx
 * - Catalog API: https://developers.qrboletos.com/reference/api/catalog-api-v1.aspx
 */

export interface TokenResponse {
  ok: boolean;
  status: string;
  data: {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
  };
  time: string;
}

export interface Customer {
  id_cliente: string;
  identificacion?: {
    tipo: string;
    numero: string;
  };
  nombre: string;
  email: string;
  telefono: string | null;
  fecha_nacimiento: string | null;
  genero: string | null;
  fecha_registro: string;
  ltv: Array<{
    moneda: string;
    valor: number;
  }>;
  fecha_ultima_compra: string | null;
  eventos: Array<{
    evento: string;
    fecha_evento: string;
    moneda: string;
    localidades: Array<{
      nombre: string;
      cantidad: number;
      valor: number;
    }>;
    total_evento: number;
  }>;
  updated_at: string;
}

export interface CustomersListResponse {
  ok: boolean;
  status: string;
  data: {
    customers: Customer[];
    next_cursor?: string;
    has_more: boolean;
  };
  time: string;
}

export interface CatalogItem {
  id_evento_espectaculo: number;
  tipo: 'match' | 'subscription' | 'event';
  evento: string;
  espectaculo: string;
  fecha_inicio: string;
  fecha_fin: string;
  venue: {
    nombre: string;
    ciudad: string;
    direccion?: string;
    departamento?: string;
    pais?: string;
  };
}

export interface CatalogListResponse {
  ok: boolean;
  status: string;
  data: {
    items: CatalogItem[];
  };
  time: string;
}

export interface CatalogPriceTier {
  titulo: string;
  valor: string;
  moneda: string;
  web: boolean;
  etapa: {
    nombre: string;
    venta_inicia: string;
    venta_finaliza: string;
    vigente: boolean;
  };
}

export interface CatalogLocalityDetail {
  id_evento_localidad: number;
  localidad: string;
  aforo: number;
  disponibles: number;
  precios: CatalogPriceTier[];
}

export interface CatalogShowDetail extends CatalogItem {
  localidades: CatalogLocalityDetail[];
}

export interface CatalogDetailResponse {
  ok: boolean;
  status: string;
  data: CatalogShowDetail;
  time: string;
}

// Token cache en memoria del servidor por scope y clientId
const tokenCache: Record<string, { token: string; expiresAt: number }> = {};

export interface QrboletosClientConfig {
  baseUrl?: string;
  scope?: 'customers' | 'catalog';
  clientId?: string;
  clientSecret?: string;
}

export class QrboletosApiClient {
  private baseUrl: string;
  private defaultScope: 'customers' | 'catalog';
  private explicitClientId?: string;
  private explicitClientSecret?: string;

  constructor(credentials?: QrboletosClientConfig) {
    this.baseUrl = (credentials?.baseUrl || process.env.QRBOLETOS_API_BASE_URL || 'https://restful.qrboletos.com').replace(/\/$/, '');
    this.defaultScope = credentials?.scope || 'customers';
    this.explicitClientId = credentials?.clientId;
    this.explicitClientSecret = credentials?.clientSecret;
  }

  private getCredentialsForScope(scope: 'customers' | 'catalog'): { clientId: string; clientSecret: string } {
    if (this.explicitClientId && this.explicitClientSecret) {
      return { clientId: this.explicitClientId, clientSecret: this.explicitClientSecret };
    }

    if (scope === 'catalog') {
      const clientId = this.explicitClientId || process.env.QRBOLETOS_CATALOG_CLIENT_ID || process.env.QRBOLETOS_EVENTS_CLIENT_ID || process.env.QRBOLETOS_CLIENT_ID || '';
      const clientSecret = this.explicitClientSecret || process.env.QRBOLETOS_CATALOG_CLIENT_SECRET || process.env.QRBOLETOS_EVENTS_CLIENT_SECRET || process.env.QRBOLETOS_CLIENT_SECRET || '';
      return { clientId, clientSecret };
    }

    // Default scope 'customers'
    const clientId = this.explicitClientId || process.env.QRBOLETOS_CUSTOMERS_CLIENT_ID || process.env.QRBOLETOS_CLIENT_ID || '';
    const clientSecret = this.explicitClientSecret || process.env.QRBOLETOS_CUSTOMERS_CLIENT_SECRET || process.env.QRBOLETOS_CLIENT_SECRET || '';
    return { clientId, clientSecret };
  }

  public hasCredentials(scope: 'customers' | 'catalog' = this.defaultScope): boolean {
    const creds = this.getCredentialsForScope(scope);
    return Boolean(creds.clientId && creds.clientSecret);
  }

  /**
   * Obtiene o reutiliza el Access Token OAuth2 especifico para cada API
   */
  public async getAccessToken(scope: 'customers' | 'catalog' = this.defaultScope): Promise<string> {
    const creds = this.getCredentialsForScope(scope);
    if (!creds.clientId || !creds.clientSecret) {
      const envPrefix = scope === 'catalog' ? 'QRBOLETOS_CATALOG_' : 'QRBOLETOS_CUSTOMERS_';
      throw new Error(`Faltan credenciales para la API ${scope} (${envPrefix}CLIENT_ID / ${envPrefix}CLIENT_SECRET).`);
    }

    const cacheKey = `${scope}:${creds.clientId}`;
    const now = Date.now();
    const cached = tokenCache[cacheKey];
    if (cached && cached.expiresAt > now + 120 * 1000) {
      return cached.token;
    }

    const tokenUrl = `${this.baseUrl}/${scope}/v1/auth/token`;
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error de autenticación API ${scope} (${res.status}): ${errText}`);
    }

    const data: TokenResponse = await res.json();
    if (!data.ok || !data.data?.access_token) {
      throw new Error(`Respuesta inválida del endpoint de autenticación (${scope}).`);
    }

    const expiresInMs = (data.data.expires_in || 3600) * 1000;
    tokenCache[cacheKey] = {
      token: data.data.access_token,
      expiresAt: now + expiresInMs,
    };

    return tokenCache[cacheKey].token;
  }

  /**
   * Listar clientes con soporte de paginación y updated_since
   */
  public async getCustomers(params?: {
    cursor?: string;
    limit?: number;
    updated_since?: string;
  }): Promise<CustomersListResponse> {
    const token = await this.getAccessToken('customers');
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.updated_since) query.set('updated_since', params.updated_since);

    const queryString = query.toString();
    const url = `${this.baseUrl}/customers/v1${queryString ? '?' + queryString : ''}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error consultando Customers API (${res.status}): ${errText}`);
    }

    return res.json();
  }

  /**
   * Consultar un cliente puntual por ID
   */
  public async getCustomerById(id: string): Promise<{ ok: boolean; data: Customer }> {
    const token = await this.getAccessToken('customers');
    const url = `${this.baseUrl}/customers/v1/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error consultando cliente ${id} (${res.status}): ${errText}`);
    }

    return res.json();
  }

  /**
   * Listar eventos en venta activa desde el catálogo
   */
  public async getCatalog(): Promise<CatalogListResponse> {
    const token = await this.getAccessToken('catalog');
    const url = `${this.baseUrl}/catalog/v1`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error consultando Catalog API (${res.status}): ${errText}`);
    }

    return res.json();
  }

  /**
   * Obtener detalle y disponibilidad de un evento/show puntual
   */
  public async getCatalogShowDetail(id: number | string): Promise<CatalogDetailResponse> {
    const token = await this.getAccessToken('catalog');
    const url = `${this.baseUrl}/catalog/v1/${id}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error consultando detalle del show ${id} (${res.status}): ${errText}`);
    }

    return res.json();
  }
}
