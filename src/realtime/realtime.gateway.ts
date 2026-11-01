import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';

function tokenOf(client: Socket): string | undefined {
  const fromAuth = client.handshake.auth?.token;
  const fromQuery = client.handshake.query?.token;
  return typeof fromAuth === 'string' ? fromAuth : typeof fromQuery === 'string' ? fromQuery : undefined;
}

/** 매장 대시보드. 직원 토큰으로 접속하면 store:{storeId} 방에 들어간다 */
@WebSocketGateway({ namespace: '/ws/store', cors: true })
export class StoreGateway implements OnGatewayConnection {
  private readonly logger = new Logger(StoreGateway.name);
  @WebSocketServer() server: Namespace;

  constructor(private readonly tokens: TokenService) {}

  handleConnection(client: Socket) {
    const principal = this.tokens.verify(tokenOf(client));
    if (principal?.role !== 'staff') {
      client.emit('error', { message: 'unauthorized' });
      client.disconnect(true);
      return;
    }
    void client.join(`store:${principal.storeId}`);
    this.logger.debug(`매장 대시보드 접속 ${principal.storeId}`);
  }

  toStore(storeId: string, event: string, payload: unknown) {
    this.server.to(`store:${storeId}`).emit(event, payload);
  }
}

/** 차량 앱. 운전자 토큰으로 접속하면 vehicle:{vehicleId} 방에 들어간다 */
@WebSocketGateway({ namespace: '/ws/vehicle', cors: true })
export class VehicleGateway implements OnGatewayConnection {
  @WebSocketServer() server: Namespace;

  constructor(private readonly tokens: TokenService) {}

  handleConnection(client: Socket) {
    const principal = this.tokens.verify(tokenOf(client));
    if (principal?.role !== 'driver') {
      client.emit('error', { message: 'unauthorized' });
      client.disconnect(true);
      return;
    }
    void client.join(`vehicle:${principal.vehicleId}`);
  }

  toVehicle(vehicleId: string, event: string, payload: unknown) {
    this.server.to(`vehicle:${vehicleId}`).emit(event, payload);
  }
}
