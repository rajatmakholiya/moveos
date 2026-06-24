import { HttpModule, HttpService } from '@nestjs/axios';
import { Global, Module, Injectable, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';

@Injectable()
export class HttpClientService {
  constructor(private readonly http: HttpService) {}

  async post<T>(url: string, data?: any, config?: Record<string, any>): Promise<T> {
    try {
      const res = await this.http.axiosRef.post(url, data, config);
      return res.data as T;
    } catch (error) {
      this.rethrow(error as AxiosError);
    }
  }

  async get<T>(url: string, config?: Record<string, any>): Promise<T> {
    try {
      const res = await this.http.axiosRef.get(url, config);
      return res.data as T;
    } catch (error) {
      this.rethrow(error as AxiosError);
    }
  }

  async put<T>(url: string, data?: any, config?: Record<string, any>): Promise<T> {
    try {
      const res = await this.http.axiosRef.put(url, data, config);
      return res.data as T;
    } catch (error) {
      this.rethrow(error as AxiosError);
    }
  }

  async delete<T>(url: string, config?: Record<string, any>): Promise<T> {
    try {
      const res = await this.http.axiosRef.delete(url, config);
      return res.data as T;
    } catch (error) {
      this.rethrow(error as AxiosError);
    }
  }

  private rethrow(error: AxiosError): never {
    if (!error.response) {
      throw new ServiceUnavailableException({
        message: 'Downstream service unavailable',
        details: error.message,
      });
    }

    const status = error.response?.status ?? 500;
    const message = (error.response?.data as any)?.message ?? error.message;
    const details = (error.response?.data as any)?.error ?? error.response?.data;
    throw new HttpException({ message, details }, status);
  }
}

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: (status: number) => status < 400,
      }),
    }),
  ],
  providers: [HttpClientService],
  exports: [HttpClientService, HttpModule],
})
export class HttpClientModule {}
