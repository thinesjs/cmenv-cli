import axios, { AxiosInstance } from "axios";
import {
  Credentials,
  RemoteGroup,
  RemoteVariable,
  ApiResponse,
  PaginatedResponse,
} from "../types";

export class CodemagicAPI {
  private client: AxiosInstance;
  private appId: string;

  constructor(credentials: Credentials) {
    this.appId = credentials.appId;

    this.client = axios.create({
      baseURL: "https://codemagic.io",
      headers: {
        "x-auth-token": credentials.apiKey,
        "Content-Type": "application/json",
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    });
  }

  async listVariableGroups(): Promise<RemoteGroup[]> {
    const response = await this.client.get<PaginatedResponse<RemoteGroup>>(
      `/api/v3/apps/${this.appId}/variable-groups`
    );
    return response.data.data;
  }

  async createVariableGroup(name: string): Promise<RemoteGroup> {
    const response = await this.client.post<ApiResponse<RemoteGroup>>(
      `/api/v3/apps/${this.appId}/variable-groups`,
      { name }
    );
    return response.data.data;
  }

  async deleteVariableGroup(groupId: string): Promise<void> {
    await this.client.delete(`/api/v3/variable-groups/${groupId}`);
  }

  async listVariables(groupId: string): Promise<RemoteVariable[]> {
    try {
      const response = await this.client.get<PaginatedResponse<RemoteVariable>>(
        `/api/v3/variable-groups/${groupId}/variables`
      );
      return response.data.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  async bulkImportVariables(
    groupId: string,
    variables: { name: string; value: string }[],
    secure: boolean
  ): Promise<void> {
    await this.client.post(`/api/v3/variable-groups/${groupId}/variables`, {
      secure,
      variables,
    });
  }

  async updateVariable(
    groupId: string,
    variableId: string,
    updates: { value?: string; secure?: boolean }
  ): Promise<void> {
    await this.client.patch(
      `/api/v3/variable-groups/${groupId}/variables/${variableId}`,
      updates
    );
  }

  async deleteVariable(groupId: string, variableId: string): Promise<void> {
    await this.client.delete(
      `/api/v3/variable-groups/${groupId}/variables/${variableId}`
    );
  }
}
