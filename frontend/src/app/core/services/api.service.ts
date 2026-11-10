import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page, PageMeta } from '../models';

interface Envelope<T> { success: boolean; data: T; meta?: PageMeta }
type Query = Record<string, string | number | boolean | null | undefined>;

export function toParams(q?: Query): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q ?? {})) if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
  return p;
}

/** All server calls go through here, so the base URL and response envelope live in one place. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  readonly base = environment.apiUrl;

  get<T>(path: string, q?: Query): Observable<T> { return this.http.get<Envelope<T>>(this.base + path, { params: toParams(q) }).pipe(map((r) => r.data)); }
  page<T>(path: string, q?: Query): Observable<Page<T>> { return this.http.get<Envelope<T[]>>(this.base + path, { params: toParams(q) }).pipe(map((r) => ({ items: r.data, meta: r.meta! }))); }
  post<T>(path: string, body: unknown = {}): Observable<T> { return this.http.post<Envelope<T>>(this.base + path, body).pipe(map((r) => r.data)); }
  put<T>(path: string, body: unknown = {}): Observable<T> { return this.http.put<Envelope<T>>(this.base + path, body).pipe(map((r) => r.data)); }
  patch<T>(path: string, body: unknown = {}): Observable<T> { return this.http.patch<Envelope<T>>(this.base + path, body).pipe(map((r) => r.data)); }
  delete<T>(path: string): Observable<T> { return this.http.delete<Envelope<T>>(this.base + path).pipe(map((r) => r.data)); }

  private save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  download(path: string, fallbackName: string, q?: Query): Observable<void> {
    return this.http.get(this.base + path, { params: toParams(q), responseType: 'blob', observe: 'response' }).pipe(map((res) => {
      const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
      this.save(res.body!, name);
    }));
  }

  downloadPost(path: string, body: unknown, fallbackName: string): Observable<void> {
    return this.http.post(this.base + path, body, { responseType: 'blob' }).pipe(map((blob) => this.save(blob, fallbackName)));
  }
}
