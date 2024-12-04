import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { PRODUCT_SERVICE } from 'src/config/services';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger('OrdersService')

  constructor(@Inject(PRODUCT_SERVICE) private readonly productsClient: ClientProxy) {
    super()
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log(`Database Connected`)
  }
  async create(createOrderDto: CreateOrderDto) {
    try {
      const productsId = createOrderDto.items.map( item => item.productId )
      const products = await firstValueFrom(this.productsClient.send({ cmd: 'validate_products' }, productsId)) // Obtengo los productos asociados a esos ids

      // Monto Total de los productos
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find( product => product.id === orderItem.productId)?.price // Se realizan los calculos contra elvalor en la base de datos asi no confiar en el valor mismo del cliente porque puede ser alterado
        
        return price * orderItem.quantity;
      }, 0) // el de products limpia los ids duplicados


      // Total de items adquiridos
      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0)

      // Crear transaccion de BD
      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map( orderItem => ({
                productId: orderItem.productId,
                quantity: orderItem.quantity,
                price: products.find(product => product.id === orderItem.productId).price
              }))
            }
          }
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            }
          }
        }
      })

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find(product => product.id === orderItem.productId).name// Como son BD distintas, se hace esto
        }))
      };

    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: `Something went wrong`
      })
    }
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalPages = await this.order.count({
      where: {
        status: orderPaginationDto.status
      }
    })

    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;

    return {
      data: await this.order.findMany({
        skip: (currentPage - 1) * perPage,
        take: perPage,
        where: {
          status: orderPaginationDto.status
        }
      }),
      meta: {
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil( totalPages / perPage )
      }
    }
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: { id },
      include: {
        OrderItem: {
          select: {
            productId: true,
            quantity: true,
            price: true
          }
        }
      }
    })

    if(!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id ${ id } not found`
      })
    }


    const products = await firstValueFrom(this.productsClient.send({ cmd: 'validate_products' }, order.OrderItem.map(orderItem => orderItem.productId)));


    return {
      ...order,
      OrderItem: order.OrderItem.map(orderItem => ({
        ...orderItem,
        name: products.find(product => product.id === orderItem.productId).name
      }))
    };
  }

  async changeOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    
    try {
      const order = await this.findOne(changeOrderStatusDto.id);

      if(order.status === changeOrderStatusDto.status) {
        return order;
      }

      return this.order.update({
        where: { id: changeOrderStatusDto.id },
        data: {
          status: changeOrderStatusDto.status
        }
      })

    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: `Error to update the order with id ${ changeOrderStatusDto?.id} to ${ changeOrderStatusDto?.status } `
      })
    }

  }
}
