import { Global, Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';

@Global()
@Module({
  imports: [EventEmitterModule.forRoot()],
  providers: [
    {
      provide: 'INTERNAL_EVENT_BUS',
      useExisting: EventEmitter2,
    },
  ],
  exports: ['INTERNAL_EVENT_BUS', EventEmitterModule],
})
export class InternalEventBusModule {}
