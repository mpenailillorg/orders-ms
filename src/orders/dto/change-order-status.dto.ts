import { OrderStatus } from "@prisma/client";
import { IsEnum, IsUUID } from "class-validator";
import { OrderStatusList } from "../enums/order.enum";

export class ChangeOrderStatusDto {


    @IsUUID(4)
    id: string;

    @IsEnum(OrderStatusList, {
        message: `Possible status values are ${ OrderStatusList }`
    })
    status: OrderStatus
}